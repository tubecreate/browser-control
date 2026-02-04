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
Your job is to convert Vietnamese or English instructions into a sequence of browser actions.
Available actions:
${JSON.stringify(this.actions, null, 2)}

Instructions:
- Handle complex sequences: search -> browse (long) -> click -> browse (long) -> exit.
- Detect CORE keywords for search (exclude "tìm kiếm", "vào google", etc.).
- Convert time (e.g., "50-100s") to "browse" iterations (10s per iteration).
- "vào kết quả tốt nhất" or "bấm vào bài" maps to "click".
- If the user specifies a profile (e.g., "mở profile 'profile1'"), extract the profile name.
- "xem video 50-100s" maps to action "watch" with duration "50-100s".

Return ONLY a JSON object. 
Example input: "mở profile 'profile1' vào google tìm kiếm 'tubecreate' và xem video 30s"
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
      
      // Sequential Fallback logic
      let actions = [];
      let profile = null;

      // Extract Profile if mentioned
      const profileMatch = prompt.match(/mở\s+profile\s+['"]([^'"]+)['"]/i) || prompt.match(/profile\s+(\w+)/i);
      if (profileMatch) {
        profile = profileMatch[1];
      }

      const actionMarkers = [
        { key: 'search', patterns: [/tìm\s+kiếm/i, /search/i, /tìm/i] },
        { key: 'browse', patterns: [/lướt\s+web/i, /lướt/i, /browse/i, /scroll/i, /wait/i, /đợi/i, /chờ/i] },
        { key: 'watch', patterns: [/xem\s+video/i, /watch/i, /xem/i] },
        { key: 'click', patterns: [/bấm\s+vào/i, /click\s+vào/i, /vào\s+kết\s+quả/i, /vào\s+bài/i, /vào/i, /click/i, /bấm/i] },
        { key: 'login', patterns: [/login/i, /đăng\s+nhập/i] },
        { key: 'comment', patterns: [/comment/i, /bình\s+luận/i, /nhận\s+xét/i] },
        { key: 'visual_scan', patterns: [/visual\s+scan/i, /scan\s+màn\s+hình/i, /phân\s+tích\s+hình/i, /analyze\s+screen/i] }
      ];

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

          // Repeated intent deduplication: skip if same key already found very close by (e.g., within 15 chars)
          // This prevents "if not login then login" from creating two login actions
          const distance = Math.abs(m.index - other.index);
          const isRepeatedIntent = m.key === other.key && distance < 15 && oi < i;

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
          let keyword = segmentContext.split(/[,;.]|rồi|xong|sau\s+đó/i)[0].trim();
          keyword = keyword.replace(/^['"]|['"]$/g, '');
          actions.push({ action: 'search', params: { keyword: keyword || 'tubecreate' } });
        } else if (current.key === 'browse') {
          const contextForTime = prompt.substring(Math.max(0, current.index - 5), end).toLowerCase();
          const timeMatch = contextForTime.match(/(\d+)/);
          let iterations = 5;
          if (timeMatch) {
            iterations = Math.floor(parseInt(timeMatch[1]) / 10);
          }
          actions.push({ action: 'browse', params: { iterations: Math.max(1, Math.min(iterations, 20)) } });
        } else if (current.key === 'watch') {
          const timeMatch = segmentContext.match(/(\d+)-(\d+)s?/) || segmentContext.match(/(\d+)s?/);
          let duration = '60s';
          if (timeMatch) {
             duration = timeMatch[0]; // Capture the full string "50-100s" or "60s"
          }
          actions.push({ action: 'watch', params: { duration } });
        } else if (current.key === 'click') {
          const isVaoGoogle = current.text.toLowerCase() === 'vào' && segmentContext.toLowerCase().startsWith('google');
          if (!isVaoGoogle) {
            const params = {};
            // Look ahead for "video" or "youtube" in a broader window
            if (lookAheadContext.includes('video') || lookAheadContext.includes('youtube')) {
              params.type = 'video';
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
          }

          actions.push({ action: 'comment', params: instructionParams });
        } else if (current.key === 'visual_scan') {
          actions.push({ action: 'visual_scan', params: {} });
        }
      }

      return {
        profile,
        actions: actions.length > 0 ? actions : [{ action: 'search', params: { keyword: 'tubecreate' } }]
      };
    }
  }
}
