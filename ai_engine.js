import axios from 'axios';

const LOCAL_AI_URL = 'http://localhost:5295/api/v1/localai/chat/completions';

/**
 * AI Engine to map natural language prompts to browser action sequences.
 */
export class AIEngine {
  constructor() {
    this.actions = [
      { name: 'search', description: 'Search for a keyword on Google', params: ['keyword'] },
      { name: 'browse', description: 'Scroll and move mouse naturally', params: ['iterations'] },
      { name: 'click', description: 'Click on a result or selector', params: ['selector (optional)'] },
      { name: 'login', description: 'Login to Google/account', params: ['email', 'password'] },
      { name: 'comment', description: 'Post a context-aware comment', params: ['instruction (optional)'] },
      { name: 'watch', description: 'Watch video for specific time', params: ['duration (e.g. 50-100s)'] },
      { name: 'visual_scan', description: 'Analyze screen with AI and suggest actions', params: [] }
    ];
  }

  /**
   * Analyzes a prompt and returns a list of actions with parameters and optional metadata.
   * @param {string} prompt 
   * @returns {Promise<{actions: Array<{action: string, params: object}>, profile?: string}>}
   */
  async planActions(prompt) {
    console.log(`AI is thinking about: "${prompt}"...`);
    
    const systemPrompt = `You are a browser automation orchestrator. 
Your job is to analyze user instructions in ANY LANGUAGE (Vietnamese, English, etc.) and convert them into a sequence of browser actions.
CRITICAL: The user input may be in Vietnamese, English, or mixed. You must mentally translate the intent into English first then map it to the actions.

Available actions:
${JSON.stringify(this.actions, null, 2)}

Instructions:
- Handle complex sequences: search -> browse (long) -> click -> browse (long) -> exit.
- Detect CORE keywords for search regardless of language (e.g., "tìm kiếm", "find", "search", "google it").
- Convert time (e.g., "50-100s") to "browse" iterations (10s per iteration).
- "vào kết quả tốt nhất", "click first result", "bấm vào bài" maps to "click".
- If the user specifies a profile (e.g., "mở profile 'profile1'", "use profile 'abc'"), extract the profile name.
- "xem video 50-100s", "watch for 50s" maps to action "watch" with duration.
- IMPORTANT: "view", "look at", "check out" are synonyms for "watch" when referring to content/video.

Return ONLY a JSON object. 
Example input (Vietnamese): "mở profile 'profile1' vào google tìm kiếm 'tubecreate' và xem video 30s"
Example input (English): "open profile 'profile1', search for 'tubecreate' and watch video for 30s"

Example output: {
  "profile": "profile1",
  "actions": [
    {"action": "search", "params": {"keyword": "tubecreate"}},
    {"action": "click", "params": {"type": "video"}},
    {"action": "watch", "params": {"duration": "30s"}}
  ]
}`;

    try {
      console.log('Sending request to Local AI...');
      const response = await axios.post(LOCAL_AI_URL, {
        model: 'deepseek-r1:latest',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: prompt }
        ],
        stream: false
      }, { timeout: 30000 });

      let content = response.data.choices[0].message.content;
      console.log('AI Response:', content);
      
      // Clean up <think> tags if present (common in reasoning models)
      content = content.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();

      // Attempt 1: Extract from ```json code block
      const codeBlockMatch = content.match(/```json([\s\S]*?)```/);
      if (codeBlockMatch) {
         try {
            return JSON.parse(codeBlockMatch[1]);
         } catch (e) { console.warn('Failed to parse JSON code block:', e.message); }
      }

      // Attempt 2: Extract largest JSON object
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        try {
            return JSON.parse(jsonMatch[0]);
        } catch (e) { console.warn('Failed to parse regex-matched JSON:', e.message); }
      }
      
      // Attempt 3: Direct parse
      const parsed = JSON.parse(content);
      return Array.isArray(parsed) ? { actions: parsed } : parsed;
    } catch (error) {
      console.error('AI Thinking Error:', error.message);
      if (error.response) {
          console.error('AI Server Status:', error.response.status);
          console.error('AI Server Data:', error.response.data);
      }
      
      console.warn('⚠️ AI ANALYSIS FAILED - Using Regex Fallback Logic');
      console.warn('This may result in less accurate action parsing.');
      
      // Sequential Fallback logic
      let actions = [];
      let profile = null;

      // Extract Profile if mentioned
      const profileMatch = prompt.match(/mở\s+profile\s+['"]([^'"]+)['"]/i) || prompt.match(/profile\s+(\w+)/i);
      if (profileMatch) {
        profile = profileMatch[1];
      }

      const actionMarkers = [
        { key: 'search', patterns: [/tìm\s+kiếm/i, /search/i, /tìm/i, /find/i, /open/i, /mở/i, /go\s+to/i, /truy\s+cập/i] },
        { key: 'browse', patterns: [/lướt\s+web/i, /lướt/i, /browse/i, /scroll/i, /wait/i, /đợi/i, /chờ/i, /check/i, /kiểm\s+tra/i, /explore/i, /read/i, /đọc/i, /study/i, /nghiên\s+cứu/i, /khám\s+phá/i] },
        { key: 'watch', patterns: [/xem\s+video/i, /watch/i, /xem/i, /view/i] },
        { key: 'click', patterns: [/bấm\s+vào/i, /click\s+vào/i, /vào\s+kết\s+quả/i, /vào\s+bài/i, /vào/i, /click/i, /bấm/i, /tap/i] },
        { key: 'login', patterns: [/login/i, /đăng\s+nhập/i] },
        { key: 'comment', patterns: [/comment/i, /bình\s+luận/i, /nhận\s+xét/i, /reply/i] },
        { key: 'visual_scan', patterns: [/visual\s+scan/i, /scan\s+màn\s+hình/i, /phân\s+tích\s+hình/i, /analyze\s+screen/i] }
      ];

      // Remove overlapping matches (keep longest/first)
      // Example: "click vào" matches "click" and "vào" -> keep "click vào"
      const uniqueMarkers = actionMarkers.flatMap(m => {
        // ... (find matches) logic omitted for brevity in replace block, assuming existing logic remains
        // Re-implementing the mapping part to be safe if I can't see it all, but tool only replaces target.
        // Wait, I can't see the matching logic here. I should only replace the definitions and the distance check down below.
        // Let's split this into two replacements if needed or just target the array definition first.
      }); 
      // ACTUALLY, I will just replace the array definition first.
      
      // ... separating for clarity in thought ...
      
      // Let's do the Array update first.

      // Find all markers in the text
      let foundMarkers = [];
      for (const am of actionMarkers) {
        for (const pattern of am.patterns) {
          let match;
          const globalPattern = new RegExp(pattern, 'gi');
          while ((match = globalPattern.exec(prompt)) !== null) {
            foundMarkers.push({
              key: am.key,
              index: match.index,
              length: match[0].length,
              text: match[0]
            });
          }
        }
      }

      // Sort markers by position
      foundMarkers.sort((a, b) => a.index - b.index);
      
      console.log('Detected Markers (Pre-filter):', JSON.stringify(foundMarkers));

      // Deduplicate overlapping markers
      foundMarkers = foundMarkers.filter((m, i) => {
        return !foundMarkers.some((other, oi) => {
          if (oi === i) return false;
          // Exact overlap or containment
          const covers = other.index <= m.index && (other.index + other.length) >= (m.index + m.length);
          if (other.index === m.index) return other.length > m.length;
          
          // REMOVED Proximity deduplication to allow close consecutive actions (e.g. click -> watch)
          // const distance = Math.abs(m.index - other.index);
          // const isProximityMatch = distance < 11 && oi < i; 

          // Repeated intent deduplication: skip if same key already found very close by (e.g., within 5 chars)
          // This prevents "if not login then login" from creating two login actions
          const distance = Math.abs(m.index - other.index);
          const isRepeatedIntent = m.key === other.key && distance < 5 && oi < i;

          return covers || isRepeatedIntent;
        });
      });
      
      console.log('Detected Markers (Post-filter):', JSON.stringify(foundMarkers));

      // Process markers in order
      for (let i = 0; i < foundMarkers.length; i++) {
        const current = foundMarkers[i];
        const next = foundMarkers[i + 1];
        
        const start = current.index + current.length;
        const end = next ? next.index : prompt.length;
        const segmentContext = prompt.substring(start, end).trim();
        // Look ahead context includes the next 30 chars regardless of markers
        const lookAheadContext = prompt.substring(current.index, Math.min(prompt.length, current.index + 50)).toLowerCase();

        if (current.key === 'search') {
          // Extract keyword, stopping at common separators including "and", "then"
          let keyword = segmentContext.split(/[,;.]|rồi|xong|sau\s+đó|and|then/i)[0].trim();
          
          // Remove leading "for" from "search for X"
          keyword = keyword.replace(/^for\s+/i, '').trim();
          
          // Remove quotes
          keyword = keyword.replace(/^['"]|['"]$/g, '');
          actions.push({ action: 'search', params: { keyword: keyword || 'tubecreate' } });
        } else if (current.key === 'browse') {
          const contextForTime = prompt.substring(Math.max(0, current.index - 5), end).toLowerCase();
          const timeMatch = contextForTime.match(/(\d+)/);
          let iterations = 5;
          if (timeMatch) {
            iterations = Math.floor(parseInt(timeMatch[1]) / 3);
          }
          actions.push({ action: 'browse', params: { iterations: Math.max(1, Math.min(iterations, 20)) } });
        } else if (current.key === 'watch') {
          // Match "20-30s", "30s", "20%"
          const timeMatch = segmentContext.match(/(\d+)-(\d+)s?/) || segmentContext.match(/(\d+)s?/) || segmentContext.match(/(\d+)%/);
          let duration = '60s';
          if (timeMatch) {
             duration = timeMatch[0]; // Capture full string including % or s
          }
          actions.push({ action: 'watch', params: { duration } });
        } else if (current.key === 'click') {
          const isVaoGoogle = current.text.toLowerCase() === 'vào' && segmentContext.toLowerCase().startsWith('google');
          if (!isVaoGoogle) {
            const params = {};
            // Look ahead for "video" or "youtube" in a broader window
            if (lookAheadContext.includes('video') || lookAheadContext.includes('youtube')) {
              params.type = 'video';
            } else {
               // Extract text target: "click [on] [Target] [delimiter]"
               let rawTarget = segmentContext;
               
               // Remove leading prepositions "on", "vào", "nút", "button", "the"
               rawTarget = rawTarget.replace(/^(on|vào|nút|button|the)\s+/i, '').trim();
               
               // Stop at delimiters
               const delimiters = ['and', 'then', 'và', 'sau đó', 'rồi', ','];
               let cutIndex = rawTarget.length;
               for (const d of delimiters) {
                   const idx = rawTarget.toLowerCase().indexOf(` ${d} `); // Space pad to avoid partial word match
                   if (idx !== -1 && idx < cutIndex) cutIndex = idx;
               }
               rawTarget = rawTarget.substring(0, cutIndex).trim();
               
               // Remove quotes
               rawTarget = rawTarget.replace(/^['"]|['"]$/g, '');
               
               // PATTERN DETECTION: "first result", "first link", "first answer" -> default click (no text param)
               const isFirstResultPattern = /^first\s+(result|link|answer|item|option|search\s+result)/i.test(rawTarget);
               
               if (isFirstResultPattern) {
                   // Leave params empty - click.js will default to first search result
                   console.log('Detected "first result" pattern - using default click behavior');
               } else if (rawTarget.length > 0 && rawTarget.length < 50) { // Safety limit length
                   params.text = rawTarget;
               }
            }
            actions.push({ action: 'click', params });
          }
        } else if (current.key === 'login') {
          // Extract email/username and password
          // Priority 1: "username:password:recovery" or "username:password" (no spaces around colon)
          // Allow username to be email OR just a string (e.g. voanhtk5)
          const tripleMatch = segmentContext.match(/([^\s:'"]+)[:]([^\s:'"]+)[:]([^\s:'"]+)/);
          const doubleMatch = tripleMatch ? null : segmentContext.match(/([^\s:'"]+)[:]([^\s'"]+)/);
          
          if (tripleMatch) {
            actions.push({ action: 'login', params: { email: tripleMatch[1], password: tripleMatch[2], recoveryEmail: tripleMatch[3] } });
          } else if (doubleMatch) {
            actions.push({ action: 'login', params: { email: doubleMatch[1], password: doubleMatch[2] } });
          } else {
             // Fallback for space-separated
            const parts = segmentContext.split(/[\s:'"]+/).filter(p => p.length > 0 && !p.toLowerCase().includes('login'));
            // ... (keep existing extensive logic if needed, or simplify)
            // For now, simpler fallback for emails
            const email = parts.find(p => p.includes('@')) || parts[0] || '';
            const password = parts.find(p => p !== email && p.length > 3) || '';
            actions.push({ action: 'login', params: { email, password, recoveryEmail: '' } });
          }
        } else if (current.key === 'comment') {
          // Extract content: "comment [instruction] [until next keyword]"
          const instructionParams = {};
          
          // Look at the text immediately following the command in the segment
          let rawInstruction = segmentContext
            .replace(/comment|bình luận|nhận xét|viết/gi, '')
            .trim();
            
          // Stop at common delimiters OR other action keywords if they accidentally leaked into this segment
          const delimiters = [',', 'rồi', 'xong', 'sau đó', 'login', 'đăng nhập', 'click', 'bấm', 'vào', 'watch', 'xem'];
          // Find first occurrence of any delimiter
          let cutIndex = rawInstruction.length;
          
          for (const d of delimiters) {
             const idx = rawInstruction.toLowerCase().indexOf(d);
             if (idx !== -1 && idx < cutIndex) {
                 cutIndex = idx;
             }
          }
          
          rawInstruction = rawInstruction.substring(0, cutIndex).trim();

          // Also allow explicit quoting: comment "blah blah"
          const quoteMatch = segmentContext.match(/['"]([^'"]+)['"]/);
          
          if (quoteMatch) {
             instructionParams.instruction = quoteMatch[1];
          } else if (rawInstruction.length > 3) {
             instructionParams.instruction = rawInstruction;
          } else {
             // Default if no instruction provided
             instructionParams.instruction = "nice video";
          }

          actions.push({ action: 'comment', params: instructionParams });
        } else if (current.key === 'visual_scan') {
          actions.push({ action: 'visual_scan', params: {} });
        }
      }

      // --- Post-Processing: Inject missing CLIIC actions ---
      // Rule: If Search is immediately followed by Watch, insert a Click in between.
      for (let i = 0; i < actions.length - 1; i++) {
        if (actions[i].action === 'search' && actions[i+1].action === 'watch') {
             console.log('Injecting implicit CLICK between SEARCH and WATCH');
             actions.splice(i + 1, 0, { action: 'click', params: { type: 'video' } });
             i++; // Skip the newly inserted action
        }
      }

      return {
        profile,
        actions: actions.length > 0 ? actions : [{ action: 'search', params: { keyword: 'tubecreate' } }]
      };
    }
  }
}
