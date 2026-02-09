import axios from 'axios';
import { getGpuUsage } from './gpu_monitor.js';

/**
 * Session Manager for Generative Browser Sessions
 * Maintains minimum 10-minute browsing sessions with context-aware action chaining
 */

export class SessionManager {
  constructor(minDurationMinutes = 10, userGoal = null, aiModel = 'qwen:latest', agentContext = null) {
    this.minDurationMs = minDurationMinutes * 60 * 1000;
    this.sessionId = null;
    this.startTime = null;
    this.actionHistory = [];
    this.currentContext = {
      url: null,
      pageType: 'unknown',
      domain: null
    };
    this.userGoal = userGoal;
    this.aiModel = aiModel;
    this.agentContext = agentContext; // NEW: Store agent context (interests, routine)
    this.aiUrl = 'http://localhost:5295/api/v1/localai/chat/completions';
    this.lastRefuelTime = 0;
    this.REFUEL_COOLDOWN_MS = 120000;
    this.taskQueue = [];
    this.gpuUsageHistory = []; // Track last 1 minute of GPU usage
    this.MAX_GPU_HISTORY = 12; // 12 samples @ 5s interval = 1 minute
    this.stats = null; // RPG Stats
  }

  /**
   * Start a new session
   * @param {string} initialUrl
   * @param {string} userGoal
   * @param {Array} initialActions - Optional queue of actions to start with
   */
  start(initialUrl = null, userGoal = null, initialActions = []) {
    this.sessionId = `session_${Date.now()}`;
    this.startTime = Date.now();
    this.actionHistory = [];
    this.taskQueue = Array.isArray(initialActions) ? [...initialActions] : [];
    
    if (userGoal) this.userGoal = userGoal;
    
    if (initialUrl) {
      this.updateContext(initialUrl);
    }
    
    // Start GPU monitoring (sample every 5 seconds)
    if (this.gpuMonitorInterval) clearInterval(this.gpuMonitorInterval);
    this.gpuMonitorInterval = setInterval(async () => {
        const usage = await getGpuUsage();
        this.gpuUsageHistory.push(usage);
        if (this.gpuUsageHistory.length > this.MAX_GPU_HISTORY) {
            this.gpuUsageHistory.shift();
        }
    }, 5000);

    console.log(`[SessionManager] Started session ${this.sessionId} (Goal: "${this.userGoal || 'Browse naturally'}")`);
    return this.sessionId;
  }

  getAverageGpuUsage() {
      if (this.gpuUsageHistory.length === 0) return 0;
      const sum = this.gpuUsageHistory.reduce((a, b) => a + b, 0);
      return Math.round(sum / this.gpuUsageHistory.length);
  }

  /**
   * Record a completed action to history
   */
  recordAction(action, params = {}) {
    this.actionHistory.push({
      action,
      params,
      url: this.currentContext.url,
      timestamp: Date.now()
    });
    console.log(`[SessionManager] Recorded action: ${action}`);
  }

  /**
   * Get elapsed time in milliseconds
   */
  getElapsedTime() {
    if (!this.startTime) return 0;
    return Date.now() - this.startTime;
  }

  /**
   * Get remaining time to reach minimum duration (in milliseconds)
   */
  getRemainingTime() {
    const elapsed = this.getElapsedTime();
    const remaining = this.minDurationMs - elapsed;
    return Math.max(0, remaining);
  }

  /**
   * Check if minimum duration has been reached
   */
  hasReachedMinimum() {
    return this.getElapsedTime() >= this.minDurationMs;
  }

  /**
   * Update current context based on URL
   */
  updateContext(url) {
    this.currentContext.url = url;
    
    try {
      const urlObj = new URL(url);
      this.currentContext.domain = urlObj.hostname;
      
      // Detect page type based on domain
      if (urlObj.hostname.includes('youtube.com')) {
        this.currentContext.pageType = url.includes('/watch') ? 'youtube_video' : 'youtube_home';
      } else if (urlObj.hostname.includes('github.com')) {
        this.currentContext.pageType = url.match(/\/[^\/]+\/[^\/]+$/) ? 'github_repo' : 'github_general';
      } else if (urlObj.hostname.includes('news') || urlObj.hostname.includes('article')) {
        this.currentContext.pageType = 'news';
      } else {
        this.currentContext.pageType = 'general_website';
      }
      
      console.log(`[SessionManager] Context updated: ${this.currentContext.pageType} @ ${this.currentContext.domain}`);
    } catch (e) {
      console.warn('[SessionManager] Failed to parse URL:', e.message);
    }
  }

  /**
   * Update RPG Stats in session (for AI context)
   */
  updateStats(stats) {
    this.stats = stats;
  }

  /**
   * Check if stuck on same URL (for recovery)
   * Requires at least 5 consecutive actions on the same URL
   */
  isStuckOnSameUrl() {
    if (this.actionHistory.length < 5) return false;
    const recent = this.actionHistory.slice(-5);
    const urls = recent.map(a => a.url);
    return urls.every(u => u === urls[0]);
  }

  /**
   * Reset stuck counter by clearing recent history (called after recovery)
   */
  resetStuckCounter() {
    // Keep only last 2 actions to maintain some context
    if (this.actionHistory.length > 2) {
      this.actionHistory = this.actionHistory.slice(-2);
    }
    console.log('[SessionManager] Reset stuck counter');
  }

  /**
   * Scan page content to detect available elements (DYNAMIC - not domain-based)
   * Also checks for ERRORS and CAPTCHAS
   * @param {import('playwright').Page} page
   * @returns {Promise<Object>} Content profile
   */
  async scanPageContent(page) {
    console.log('[SessionManager] Scanning page content...');
    
    try {
      const content = await page.evaluate(() => {
        const bodyText = document.body.innerText;
        
        // Error Detection
        const isErrorPage = 
          bodyText.includes("This site can't be reached") ||
          bodyText.includes("ERR_NAME_NOT_RESOLVED") ||
          bodyText.includes("ERR_CONNECTION_TIMED_OUT") ||
          bodyText.includes("DNS_PROBE_FINISHED_NXDOMAIN") ||
          bodyText.includes("500 Internal Server Error") ||
          bodyText.includes("404 Not Found");
          
        // Captcha Detection - DISABLED by user request
        const hasCaptcha = false;
        /* 
        const isFinancialSite = window.location.hostname.includes('bloomberg') || 
                               window.location.hostname.includes('forbes') || 
                               window.location.hostname.includes('yahoo');
                               
        const hasCaptcha = 
          !isFinancialSite && // Skip aggressive checks on known financial news sites
          (document.querySelectorAll('iframe[src*="recaptcha"]').length > 0 ||
          document.querySelectorAll('iframe[src*="cloudflare"]').length > 0 ||
          document.querySelector('#captcha') !== null) && 
          // Only if it really looks like a blocking captcha page
          (bodyText.length < 2000 || 
           (bodyText.includes("Verify you are human") && !bodyText.includes("human resources")) || 
           (bodyText.includes("security check") && !bodyText.includes("security check-in")));
        */
        
        // Popup / Blocking Element Detection
        const potentialPopups = [];
        const dismissTerms = [
          'not interested', 'no thanks', 'close', 'accept', 'agree', 'got it', 
          'maybe later', 'dismiss', 'i agree', 'allow', 'ok', 'not now',
          'no', 'reject', 'decline', 'cookie', 'consent', 'i understand'
        ];
        
        const allInteractive = document.querySelectorAll('a[href], button, input[type="submit"], [role="button"]');
        for (const el of allInteractive) {
          const text = el.innerText?.trim() || el.textContent?.trim() || el.getAttribute('aria-label') || el.getAttribute('title') || '';
          const lowerText = text.toLowerCase();
          
          if (dismissTerms.some(term => lowerText === term || (lowerText.length < 20 && lowerText.includes(term)))) {
            const rect = el.getBoundingClientRect();
            if (rect.width > 0 && rect.height > 0) {
              potentialPopups.push({
                text: text.substring(0, 40),
                tag: el.tagName.toLowerCase()
              });
            }
          }
        }

        // Extract Interactive Elements (links, buttons) for AI selection
        const interactiveElements = [];
        let count = 0;
        for (const el of allInteractive) {
          if (count >= 40) break; // Increased limit slightly
          
          const rect = el.getBoundingClientRect();
          const text = el.innerText?.trim() || el.textContent?.trim() || el.getAttribute('aria-label') || el.getAttribute('title') || '';
          
          if (rect.width > 0 && rect.height > 0 && text.length > 0) {
            interactiveElements.push({
              text: text.substring(0, 80), // Truncate long text
              tag: el.tagName.toLowerCase(),
              href: (el.tagName === 'A' ? el.href : null)
            });
            count++;
          }
        }
        
        // Video detection: Only count VISIBLE, interactive videos (not background decoration)
        const videos = document.querySelectorAll('video');
        let interactiveVideoCount = 0;
        for (const vid of videos) {
          const rect = vid.getBoundingClientRect();
          const isVisible = rect.width > 100 && rect.height > 100; // Substantial size
          const isInteractive = !vid.muted || vid.controls; // Has controls or not muted
          if (isVisible && isInteractive) {
            interactiveVideoCount++;
          }
        }
        
        return {
          isErrorPage,
          hasCaptcha,
          potentialPopups, // NEW: List of suspected closing buttons
          interactiveElements, 
          hasVideo: interactiveVideoCount > 0, 
          videoCount: interactiveVideoCount,
          hasArticles: document.querySelectorAll('article, .post, .article, [role="article"]').length > 0,
          articleCount: document.querySelectorAll('article, .post, .article, [role="article"]').length,
          hasForm: document.querySelectorAll('form').length > 0,
          formCount: document.querySelectorAll('form').length,
          linkCount: document.querySelectorAll('a[href]:not([href*="javascript"]):not([href="#"])').length,
          hasSearchBox: document.querySelectorAll('input[type="search"], input[name*="search" i], input[placeholder*="search" i]').length > 0,
          imageCount: document.querySelectorAll('img').length,
          headingCount: document.querySelectorAll('h1, h2, h3').length,
          hasCommentSection: document.querySelectorAll('[class*="comment" i], [id*="comment" i]').length > 0
        };
      });
      
      if (content.isErrorPage || (content.hasCaptcha && !content.potentialPopups.length)) { // Only warn if captcha AND no popups to dismiss
        console.warn(`[SessionManager] DETECTED ISSUE: Error=${content.isErrorPage}, Captcha=${content.hasCaptcha}`);
      } else if (content.potentialPopups.length > 0) {
        console.log(`[SessionManager] POTENTIAL POPUPS DETECTED:`, content.potentialPopups.map(p => p.text));
      } else {
        console.log(`[SessionManager] Scan results: LinkCount=${content.linkCount}, HasArticles=${content.hasArticles}`);
      }
      return content;
    } catch (e) {
      console.warn('[SessionManager] Page scan failed:', e.message);
      // Assume error state to be safe if we can't scan
      return {
        isErrorPage: true,
        hasCaptcha: false,
        interactiveElements: [], // Empty list on error
        hasVideo: false,
        videoCount: 0,
        hasArticles: false,
        articleCount: 0,
        hasForm: false,
        formCount: 0,
        linkCount: 0,
        hasSearchBox: false,
        imageCount: 0,
        headingCount: 0,
        hasCommentSection: false
      };
    }
  }

  /**
   * Generate next action based on current context and page content
   * @param {Object} page - Playwright page object
   * @param {Object} pageContent - Results from scanPageContent()
   * Returns: Promise<{ action: string, params: object }>
   */
  async generateNextAction(page, pageContent = null) {
    const remainingMs = this.getRemainingTime();
    const remainingMinutes = Math.ceil(remainingMs / 60000);
    
    console.log(`[SessionManager] Generating next action (${remainingMinutes} min remaining)`);
    
    // Priority 0: Task Queue (Follow the prescribed schedule first)
    if (this.taskQueue.length > 0) {
      const nextFromQueue = this.taskQueue.shift();
      console.log(`[SessionManager] Using action from queue (${this.taskQueue.length} remaining in schedule): ${nextFromQueue.action}`);
      return [nextFromQueue]; // Return as a single-action chain to maintain sequence
    }

    // ERROR / CAPTCHA RECOVERY
    if (pageContent && (pageContent.isErrorPage || pageContent.hasCaptcha)) {
      console.log('[SessionManager] Critical page issue detected. Triggering NEW TASK recovery.');
      // Return a navigation action to a safe random portal to "start new task"
      const safeSites = [
        'https://news.google.com',
        'https://www.youtube.com',
        'https://github.com/trending',
        'https://www.bing.com',
        'https://www.yahoo.com'
      ];
      const randomSite = safeSites[Math.floor(Math.random() * safeSites.length)];
      return { 
        action: 'search', 
        params: { 
          keyword: randomSite, // Effectively navigates or searches for it
          forceNavigation: true // Signal to system to treat this as a navigation
        } 
      };
    }

    // If minimum duration reached, return null to signal session can end
    if (this.hasReachedMinimum()) {
      console.log('[SessionManager] Minimum duration reached. Session can end.');
      return null;
    }

    // AI-Driven Generation (if goal is set)
    if (this.userGoal) {
      try {
        // AI Refueling Logic: Check GPU usage (AVERAGE over last minute) and COOLDOWN
        const gpuUsage = this.getAverageGpuUsage();
        console.log(`[SessionManager] Average GPU Usage (1 min): ${gpuUsage}%`);
        
        let aiAction = null;
        const now = Date.now();
        const timeSinceLastRefuel = now - this.lastRefuelTime;

        if (gpuUsage > 90 && timeSinceLastRefuel > this.REFUEL_COOLDOWN_MS) {
          console.log('[SessionManager] 🚀 AVG GPU is HIGH (>90%). Cooldown passed. Switching to AI Refueling (ChatGPT Web)...');
          aiAction = await this.generateAIActionViaChatGPTWeb(page, pageContent, remainingMinutes);
        } else {
          if (gpuUsage > 90) {
            console.log(`[SessionManager] AVG GPU is high but cooling down (${Math.ceil((this.REFUEL_COOLDOWN_MS - timeSinceLastRefuel)/1000)}s left). Using Local AI.`);
          }
          aiAction = await this.generateAIAction(pageContent, remainingMinutes);
        }

        if (aiAction) {
          // Normalize to array
          const actionChain = Array.isArray(aiAction) ? aiAction : [aiAction];
          
          for (const action of actionChain) {
            // RANDOMIZE DURATION for AI actions if they specify time
            if (action.params) {
               if (action.params.duration) {
                 // Randomize duration (e.g. "120s" -> random 80-130s)
                 let seconds = parseInt(action.params.duration);
                 if (!isNaN(seconds)) {
                   const variance = 0.7 + Math.random() * 0.4; 
                   const newSeconds = Math.floor(seconds * variance);
                   action.params.duration = `${newSeconds}s`;
                 }
               }
               if (action.params.iterations) {
                  const base = parseInt(action.params.iterations) || 5;
                  const variance = Math.floor(Math.random() * 4) - 2;
                  action.params.iterations = Math.max(3, base + variance);
               }
            }
          }
          console.log(`[SessionManager] Generated Action Chain (${actionChain.length} steps):`, actionChain);
          return actionChain;
        }
      } catch (e) {
        console.error('[SessionManager] AI generation failed, falling back to heuristic:', e.message);
      }
    }

    // Heuristic Fallback
    const action = this._getContentBasedAction(pageContent, remainingMs);
    console.log(`[SessionManager] Heuristic Action:`, action);
    return action;
  }

  /**
   * Generate action using Local AI based on goal and context
   */
  async generateAIAction(pageContent, remainingMinutes) {
    // Build list of interactive elements for AI to choose from
    const elementList = (pageContent?.interactiveElements || [])
      .map((el, idx) => `${idx + 1}. [${el.tag}] "${el.text}"`)
      .join('\n');
    
    const hasElements = elementList.length > 0;

    const context = {
      url: this.currentContext.url,
      domain: this.currentContext.domain,
      pageType: this.currentContext.pageType,
      hasVideo: pageContent?.hasVideo || false,
      hasSearchBox: pageContent?.hasSearchBox || false,
      remainingMinutes,
      recentHistory: this.actionHistory.slice(-3).map(a => `${a.action} on ${a.url}`)
    };

    // Detect if on YouTube to provide specific guidance
    const isYouTube = context.domain?.includes('youtube.com');
    const videoLinks = (pageContent?.interactiveElements || []).filter(el => 
      el.href?.includes('youtube.com/watch')
    );
    
    let contextHint = '';
    if (isYouTube && videoLinks.length > 0) {
      contextHint = `\nCONTEXT: You are on YouTube with ${videoLinks.length} video links available. To watch videos, CLICK on a video title link (contains "/watch" in href).`;
    }

    const prompt = this._buildAIPrompt(context, contextHint, hasElements, elementList, pageContent?.potentialPopups || []);

    try {
      console.log(`[SessionManager] Requesting action from AI model: ${this.aiModel}...`);
      const response = await axios.post(this.aiUrl, {
        model: this.aiModel, // Use configured AI model
        messages: [{ role: "user", content: prompt }],
        stream: false,
        temperature: 0.7,
        format: "json" // Request JSON format explicitly
      }, { timeout: 60000 }); // 60s timeout (qwen is fast)

      // Parse JSON from response
      let content = response.data?.choices?.[0]?.message?.content;
      if (!content) return null;

      // Extract JSON block (array or object) with better regex
      let jsonMatch = content.match(/\[[\s\S]*\]/) || content.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        console.warn('[SessionManager] No JSON found in AI response:', content);
        return null;
      }

      let jsonStr = jsonMatch[0];
      
      // Clean common AI formatting errors
      jsonStr = jsonStr
        .replace(/,(\s*[\]}])/g, '$1')  // Remove trailing commas
        .replace(/\/\/.*/g, '')          // Remove // comments
        .replace(/\/\*[\s\S]*?\*\//g, ''); // Remove /* */ comments
      
      try {
        const parsed = JSON.parse(jsonStr);
        return Array.isArray(parsed) ? parsed : [parsed];
      } catch (parseError) {
        console.error('[SessionManager] JSON Parse Error:', parseError.message);
        console.error('[SessionManager] Attempted to parse:', jsonStr.substring(0, 200));
        return null;
      }
    } catch (error) {
      console.warn('[SessionManager] AI Request Error:', error.message);
      return null;
    }
  }

  /**
   * AI Refueling: Generate action via ChatGPT website in a new tab
   */
  async generateAIActionViaChatGPTWeb(page, pageContent, remainingMinutes) {
    console.log('[SessionManager] AI REFUELING: Opening ChatGPT in background tab...');
    
    const context = {
      url: this.currentContext.url,
      domain: this.currentContext.domain,
      pageType: this.currentContext.pageType,
      hasVideo: pageContent?.hasVideo || false,
      hasSearchBox: pageContent?.hasSearchBox || false,
      remainingMinutes,
      recentHistory: this.actionHistory.slice(-3).map(a => `${a.action} on ${a.url}`)
    };

    const elementList = (pageContent?.interactiveElements || [])
      .map((el, idx) => `${idx + 1}. [${el.tag}] "${el.text}"`)
      .join('\n');
    
    const prompt = this._buildAIPrompt(context, '', elementList.length > 0, elementList, pageContent?.potentialPopups || []);
    
    let chatTab = null;
    try {
      chatTab = await page.context().newPage();
      
      // Safety check: Ensure we didn't get the same page
      if (chatTab === page) {
         console.warn('[SessionManager] New tab is same as main page! Aborting refueling.');
         return null;
      }
      
      await chatTab.goto('https://chatgpt.com', { waitUntil: 'domcontentloaded', timeout: 30000 });
      
      // Safety Check: Verify Login
      const inputSelector = '#prompt-textarea';
      try {
          await chatTab.waitForSelector(inputSelector, { timeout: 8000 });
      } catch (e) {
          console.warn('[SessionManager] ChatGPT Prompt Input NOT found. Possible LOGIN required.');
          
          // Check for login buttons/text
          const headers = await chatTab.$$('h1, h2, div[role="heading"]');
          for (const h of headers) {
              const text = await h.innerText();
              if (text.toLowerCase().includes('welcome back') || text.toLowerCase().includes('login') || text.toLowerCase().includes('sign up')) {
                  console.error('[SessionManager] 🛑 ChatGPT IS NOT LOGGED IN. Aborting AI Refueling to prevent hang.');
                  await chatTab.close();
                  return null;
              }
          }
          
          // If unsure, still abort to be safe
          console.warn('[SessionManager] Could not confirm ChatGPT ready state. Aborting.');
          await chatTab.close();
          return null;
      }
      
      // Type and send
      await chatTab.fill(inputSelector, prompt);
      await chatTab.keyboard.press('Enter');
      console.log('[SessionManager] Prompt sent to ChatGPT. Waiting for JSON response...');

      // Wait for response to finish generating (increased to 45 attempts = 90s for long plans)
      let aiResponse = null;
      let attempts = 0;
      while (attempts < 45) {
        await chatTab.waitForTimeout(2000);
        // Check if chatTab is still open
        if (chatTab.isClosed()) break;
        
        try {
            const content = await chatTab.content();
            
            // Improved Regex: Handle markdown code blocks and find the first array [ ]
            const jsonBlockMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/) || content.match(/(\[[\s\S]*?\])/);
            
            if (jsonBlockMatch) {
              const rawJson = jsonBlockMatch[1] || jsonBlockMatch[0];
              const parsed = JSON.parse(rawJson.trim());
              aiResponse = Array.isArray(parsed) ? parsed : [parsed];
              
              if (aiResponse.length >= 2) { // Ensure we got at least a partial chain
                console.log(`[SessionManager] AI Refueling SUCCESS! Obtained ${aiResponse.length} steps.`);
                break;
              }
            }
        } catch (e) {
             // Content read error, maybe reloading or busy
        }
        attempts++;
      }
      
      if (aiResponse) {
        console.log('[SessionManager] Switching back to main page...');
        this.lastRefuelTime = Date.now(); // Record success time
        
        // Bring main page to front first to avoid context closure issues
        try { await page.bringToFront(); } catch(e) {}
        try { await page.waitForTimeout(1000); } catch(e) {}
        
        console.log('[SessionManager] Closing ChatGPT tab...');
        await chatTab.close();
        chatTab = null; 
        
        // Double check main page is alive
        if (page.isClosed()) throw new Error('Main page closed during refueling');
      }

      return aiResponse;
    } catch (e) {
      console.error('[SessionManager] AI Refueling FAILED:', e.message);
      return null;
    } finally {
      if (chatTab && !chatTab.isClosed()) {
        try { await chatTab.close(); } catch(e) {}
      }
    }
  }

  _buildAIPrompt(context, contextHint, hasElements, elementList, potentialPopups = []) {
    const popupInfo = potentialPopups.length > 0 
      ? `\nSUSPECTED POPUPS/OVERLAYS DETECTED (Dismissal buttons):
${potentialPopups.map((p, i) => `${i+1}. [${p.tag}] "${p.text}"`).join('\n')}\n`
      : '';

    let statsContext = "";
    if (this.stats) {
        statsContext = `
RPG STATS (YOU ARE A "${this.stats.class.toUpperCase()}" - Level ${this.stats.level}):
- INT: ${this.stats.int} | IMPACT: ${this.stats.impact} | ASSIST: ${this.stats.assist} | MISTAKE: ${this.stats.mistake}
GOAL: Improve your lowest stat while fulfilling the User Goal.
Guidelines:
${this.stats.class === 'Scholar' ? '- Focus on deep researching and reading.' : ''}
${this.stats.class === 'Builder' ? '- Focus on creating content/comments.' : ''}
${this.stats.class === 'Supporter' ? '- Focus on watching/liking.' : ''}
`;
    }

    let identityContext = "";
    if (this.agentContext) {
        identityContext = `
AGENT IDENTITY:
Name: ${this.agentContext.name || 'Agent'}
Role: ${this.agentContext.role || 'Assistant'}
Tone: ${this.agentContext.tone || 'Neutral'}
Routine: ${this.agentContext.routine ? JSON.stringify(this.agentContext.routine) : 'None'}
Background: ${this.agentContext.background || ''}
`;
    }

    return `You are an autonomous browser agent.
User Goal: "${this.userGoal}"
${statsContext}
${identityContext}
Current Context: ${JSON.stringify(context, null, 2)}${contextHint}
${popupInfo}

${hasElements ? `AVAILABLE INTERACTIVE ELEMENTS (links/buttons on page):
${elementList}
` : 'No interactive elements detected on page.'}

INSTRUCTIONS:
1. Generate an EXTENDED TASK PLAN (array of 10-15 actions) to progress towards the goal.
2. We MUST minimize AI calls, so provide a VERY LONG chain of logical steps.
3. IF a popup or cookie banner is visible (see SUSPECTED POPUPS above), PRIORITIZE clicking the dismissal button to close it.
4. IF clicking: YOU MUST use the EXACT "text" from the lists above.
5. For News/Articles: Chain multiple 'browse' and 'click' actions on related content.
6. For YouTube: Chain 'click' on videos and 'watch' actions.

Available actions:
- search { "keyword": "search term" }
- click { "text": "EXACT TEXT FROM LIST" }
- browse { "iterations": 5 }
- watch { "duration": "60s" }

CRITICAL: Output MUST be valid JSON array. Example:
[
  { "action": "click", "params": { "text": "GitHub - How AI Development Has Changed" } },
  { "action": "browse", "params": { "iterations": 8 } },
  { "action": "search", "params": { "keyword": "latest technology" } }
]

Output ONLY the JSON array, no explanations:`;
  }

  /**
   * Get action based on actual page content (DYNAMIC - heuristic fallback)
   */
  _getContentBasedAction(pageContent, remainingMs) {
    if (!pageContent) {
      console.warn('[SessionManager] No page content provided, using fallback');
      return this._getFallbackAction();
    }
    
    const rand = Math.random();
    const currentUrl = this.currentContext.url || '';
    
    // PRIORITY 0: YouTube - Focus on watching videos
    if (currentUrl.includes('youtube.com')) {
      if (currentUrl.includes('/watch')) {
        // Already on video page, just watch
        return [{ action: 'watch', params: { duration: '60s' } }];
      }
      
      // SEARCH LOGIC: If on Home/Search results (and random < 0.4), trigger a new search based on CONTEXT
      if (this.agentContext && rand < 0.4) {
        let searchTerm = null;
        
        // 1. Check Routine Tasks for current period
        const routineTasks = this.agentContext.routine_tasks || {};
        const activeTasks = Object.keys(routineTasks).filter(k => routineTasks[k]);
        
        // 2. Check Interests
        const interests = this.agentContext.interests || [];
        
        const topics = [...activeTasks, ...interests];
        
        if (topics.length > 0) {
            const randomTopic = topics[Math.floor(Math.random() * topics.length)];
            // Format topic for search (replace underscores)
            const topicClean = randomTopic.replace(/_/g, ' ');
            
            const suffixes = ['tutorial', 'explained', 'review', 'news', 'documentary', 'live'];
            const randomSuffix = suffixes[Math.floor(Math.random() * suffixes.length)];
            
            searchTerm = `${topicClean} ${randomSuffix}`;
            console.log(`[SessionManager] 🎯 Context-Aware Search triggered: "${searchTerm}" (Source: ${randomTopic})`);
            
            return [
                { action: 'search', params: { keyword: searchTerm } },
                { action: 'browse', params: { iterations: 2 } } // Short browse after search
            ];
        }
      }
      
      // On YouTube home/search, prioritize clicking videos
      const videoLinks = (pageContent.interactiveElements || []).filter(el =>
        el.href?.includes('youtube.com/watch') || el.href?.includes('/watch?v=')
      );
      
      if (videoLinks.length > 0 && rand < 0.8) {
        const randomVideo = videoLinks[Math.floor(Math.random() * videoLinks.length)];
        return [
          { action: 'click', params: { text: randomVideo.text } },
          { action: 'watch', params: { duration: '60s' } }
        ];
      }
      
      return [{ action: 'browse', params: { iterations: 5 } }];
    }
    
    // Priority 1: Videos (if present)
    if (pageContent.hasVideo && pageContent.videoCount > 0) {
      if (remainingMs > 180000) { // > 3 minutes remaining
        return [{ action: 'watch', params: { duration: '30-50%' } }];
      } else if (rand < 0.6) {
        return [{ action: 'watch', params: { duration: '15-25%' } }];
      }
      // 40% chance: browse or click instead of watching
    }
    
    // Priority 2: Articles/Content (long-form reading)
    if (pageContent.hasArticles && pageContent.articleCount > 0) {
      if (rand < 0.5) {
        return [{ action: 'browse', params: { iterations: 10 } }];
      } else {
        // Click on another article
        return [{ action: 'click', params: { selector: 'article a[href], .post a[href], [role="article"] a[href]' } }];
      }
    }
    
    // Priority 3: Comment sections (engage)
    if (pageContent.hasCommentSection && rand < 0.2) {
      return [{ action: 'comment', params: { text: 'Interesting perspective!' } }];
    }
    
    // Priority 4: Links (navigation)
    if (pageContent.linkCount > 10) {
      if (rand < 0.6) {
        return [{ action: 'browse', params: { iterations: 8 } }];
      } else {
        // Click a random link to navigate
        return [{ action: 'click', params: { selector: 'a[href]:not([href*="google.com"]):not([href="#"])' } }];
      }
    }
    
    // Priority 5: Search functionality
    if (pageContent.hasSearchBox && rand < 0.3) {
      const searchTerms = ['latest news', 'trending', 'popular', 'new', 'best'];
      const term = searchTerms[Math.floor(Math.random() * searchTerms.length)];
      return [{ action: 'search', params: { keyword: term } }];
    }
    
    // Fallback: Return a small sequence of actions instead of just one
    return [
      { action: 'browse', params: { iterations: 5 } },
      { action: 'click', params: { selector: 'a[href]:not([href*="google.com"])' } }
    ];
  }

  /**
   * Fallback action when no content scan available
   */
  _getFallbackAction() {
    return [
      { action: 'browse', params: { iterations: 10 } }
    ];
  }

  /**
   * Get session status
   */
  getStatus() {
    return {
      sessionId: this.sessionId,
      elapsedMs: this.getElapsedTime(),
      elapsedMinutes: Math.floor(this.getElapsedTime() / 60000),
      remainingMs: this.getRemainingTime(),
      remainingMinutes: Math.ceil(this.getRemainingTime() / 60000),
      hasReachedMinimum: this.hasReachedMinimum(),
      actionsCompleted: this.actionHistory.length,
      currentUrl: this.currentContext.url,
      pageType: this.currentContext.pageType
    };
  }

  /**
   * End session
   */
  end() {
    const status = this.getStatus();
    console.log(`[SessionManager] Session ${this.sessionId} ended.`, status);
    
    // Reset state
    this.sessionId = null;
    this.startTime = null;
    this.actionHistory = [];
    
    return status;
  }
}
