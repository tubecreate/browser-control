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
      { name: 'comment', description: 'Post a context-aware comment', params: [] }
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

Return ONLY a JSON object. 
Example input: "mở profile 'profile1' và vào google tìm kiếm 'tubecreate'"
Example output: {
  "profile": "profile1",
  "actions": [
    {"action": "search", "params": {"keyword": "tubecreate"}}
  ]
}`;

    try {
      console.log('Sending request to Local AI...');
      const response = await axios.post(LOCAL_AI_URL, {
        model: 'deepseek-chat',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: prompt }
        ],
        stream: false
      }, { timeout: 30000 });

      const content = response.data.choices[0].message.content;
      console.log('AI Response:', content);
      
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }
      
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
        { key: 'browse', patterns: [/lướt\s+web/i, /lướt/i, /browse/i, /scroll/i, /xem/i] },
        { key: 'click', patterns: [/bấm\s+vào/i, /click\s+vào/i, /vào\s+kết\s+quả/i, /vào\s+bài/i, /vào/i, /click/i, /bấm/i] },
        { key: 'login', patterns: [/login/i, /đăng\s+nhập/i] },
        { key: 'comment', patterns: [/comment/i, /bình\s+luận/i, /nhận\s+xét/i] }
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

      // Deduplicate overlapping or adjacent markers (prefer longer or earlier matches)
      foundMarkers = foundMarkers.filter((m, i) => {
        return !foundMarkers.some((other, oi) => {
          if (oi === i) return false;
          // Exact overlap or containment
          const covers = other.index <= m.index && (other.index + other.length) >= (m.index + m.length);
          if (other.index === m.index) return other.length > m.length;
          // Proximity deduplication: if two markers are within 10 chars of each other
          const distance = Math.abs(m.index - other.index);
          const isProximityMatch = distance < 11 && oi < i; 
          
          // Repeated intent deduplication: skip if same key already found very close by (e.g., within 50 chars)
          const isRepeatedIntent = m.key === other.key && distance < 51 && oi < i;

          return covers || isProximityMatch || isRepeatedIntent;
        });
      });

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
          // Extract email, password, and recovery email from context
          // Handle 'email:password:recovery' or 'email:password' or separate words
          const tripleMatch = segmentContext.match(/([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})[:\s]([^\s'":]+)[:]([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/);
          const doubleMatch = tripleMatch ? null : segmentContext.match(/([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})[:\s]([^\s'"]+)/);
          
          if (tripleMatch) {
            actions.push({ action: 'login', params: { email: tripleMatch[1], password: tripleMatch[2], recoveryEmail: tripleMatch[3] } });
          } else if (doubleMatch) {
            actions.push({ action: 'login', params: { email: doubleMatch[1], password: doubleMatch[2] } });
          } else {
            const parts = segmentContext.split(/[\s:'"]+/).filter(p => p.length > 0 && !p.toLowerCase().includes('login'));
            const emails = parts.filter(p => p.includes('@'));
            const email = emails[0] || '';
            const recoveryEmail = emails[1] || '';
            const password = parts.find(p => !p.includes('@') && p.length > 3);
            actions.push({ action: 'login', params: { email, password: password || '', recoveryEmail } });
          }
        } else if (current.key === 'comment') {
          actions.push({ action: 'comment', params: {} });
        }
      }

      return {
        profile,
        actions: actions.length > 0 ? actions : [{ action: 'search', params: { keyword: 'tubecreate' } }]
      };
    }
  }
}
