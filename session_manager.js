import axios from 'axios';

/**
 * Session Manager for Generative Browser Sessions
 * Maintains minimum 10-minute browsing sessions with context-aware action chaining
 */

export class SessionManager {
  constructor(minDurationMinutes = 10, userGoal = null) {
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
    this.aiUrl = 'http://localhost:5295/api/v1/localai/chat/completions';
  }

  /**
   * Start a new session
   */
  start(initialUrl = null, userGoal = null) {
    this.sessionId = `session_${Date.now()}`;
    this.startTime = Date.now();
    this.actionHistory = [];
    if (userGoal) this.userGoal = userGoal;
    
    if (initialUrl) {
      this.updateContext(initialUrl);
    }
    
    console.log(`[SessionManager] Started session ${this.sessionId} (Goal: "${this.userGoal || 'Browse naturally'}")`);
    return this.sessionId;
  }

  // ... (keep intermediate methods: getElapsedTime, getRemainingTime, hasReachedMinimum, updateContext, isStuckOnSameUrl, scanPageContent, recordAction) ...

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
          
        // Captcha Detection
        const hasCaptcha = 
          document.querySelectorAll('iframe[src*="recaptcha"]').length > 0 ||
          document.querySelectorAll('iframe[src*="cloudflare"]').length > 0 ||
          document.querySelector('#captcha') !== null ||
          bodyText.includes("Verify you are human") ||
          bodyText.includes("security check");
          
        return {
          isErrorPage,
          hasCaptcha,
          hasVideo: document.querySelectorAll('video').length > 0,
          videoCount: document.querySelectorAll('video').length,
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
      
      if (content.isErrorPage || content.hasCaptcha) {
        console.warn(`[SessionManager] DETECTED ISSUE: Error=${content.isErrorPage}, Captcha=${content.hasCaptcha}`);
      } else {
        console.log(`[SessionManager] Scan results:`, content);
      }
      return content;
    } catch (e) {
      console.warn('[SessionManager] Page scan failed:', e.message);
      // Assume error state to be safe if we can't scan
      return {
        isErrorPage: true,
        hasCaptcha: false,
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
   * @param {Object} pageContent - Results from scanPageContent()
   * Returns: Promise<{ action: string, params: object }>
   */
  async generateNextAction(pageContent = null) {
    const remainingMs = this.getRemainingTime();
    const remainingMinutes = Math.ceil(remainingMs / 60000);
    
    console.log(`[SessionManager] Generating next action (${remainingMinutes} min remaining)`);
    
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
        const aiAction = await this.generateAIAction(pageContent, remainingMinutes);
        if (aiAction) {
          // RANDOMIZE DURATION for AI actions if they specify time
          if (aiAction.params) {
             if (aiAction.params.duration) {
               // Randomize duration (e.g. "120s" -> random 80-130s)
               let seconds = parseInt(aiAction.params.duration);
               if (!isNaN(seconds)) {
                 // Random factor between 0.7 and 1.1 (e.g. 100s -> 70s to 110s)
                 const variance = 0.7 + Math.random() * 0.4; 
                 const newSeconds = Math.floor(seconds * variance);
                 aiAction.params.duration = `${newSeconds}s`;
                 console.log(`[SessionManager] Randomized duration: ${seconds}s -> ${newSeconds}s`);
               }
             }
             if (aiAction.params.iterations) {
                // Randomize iterations (e.g. 5 -> 3-8)
                const base = parseInt(aiAction.params.iterations) || 5;
                const variance = Math.floor(Math.random() * 4) - 2; // -2 to +2
                aiAction.params.iterations = Math.max(3, base + variance);
             }
          }
          console.log(`[SessionManager] AI Generated Action:`, aiAction);
          return aiAction;
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
    const context = {
      url: this.currentContext.url,
      domain: this.currentContext.domain,
      pageType: this.currentContext.pageType,
      visibleElements: pageContent || {},
      remainingMinutes,
      recentHistory: this.actionHistory.slice(-3).map(a => `${a.action} on ${a.url}`)
    };

    const prompt = `You are an autonomous browser agent.
User Goal: "${this.userGoal}"
Current Context: ${JSON.stringify(context, null, 2)}

Instructions:
1. Analyze the current page state and history.
2. Decide the NEXT single browser action to progress towards the goal.
3. Available actions:
   - search { keyword: "..." }
   - click { selector: "..." OR text: "..." } (Make sure element exists in visibleElements)
   - browse { iterations: 5-10 } (Use this to read content or wait)
   - watch { duration: "30s" } (If video available)
4. If the goal is "research" or "browse", alternate between reading (browse) and clicking links.
5. If on a search engine, click a result.
6. If on a content page, read it (browse).

Output JSON ONLY: { "action": "...", "params": { ... } }`;

    try {
      const response = await axios.post(this.aiUrl, {
        model: "deepseek-r1:latest", // Or user preference if we could pass it
        messages: [{ role: "user", content: prompt }],
        stream: false,
        temperature: 0.7
      }, { timeout: 60000 }); // 60s timeout for step decision

      // Parse JSON from response
      let content = response.data?.choices?.[0]?.message?.content;
      if (!content) return null;

      // Extract JSON block
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }
      return null;
    } catch (error) {
      console.warn('[SessionManager] AI Request Error:', error.message);
      return null;
    }
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
    
    // Priority 1: Videos (if present)
    if (pageContent.hasVideo && pageContent.videoCount > 0) {
      if (remainingMs > 180000) { // > 3 minutes remaining
        return { action: 'watch', params: { duration: '30-50%' } };
      } else if (rand < 0.6) {
        return { action: 'watch', params: { duration: '15-25%' } };
      }
      // 40% chance: browse or click instead of watching
    }
    
    // Priority 2: Articles/Content (long-form reading)
    if (pageContent.hasArticles && pageContent.articleCount > 0) {
      if (rand < 0.5) {
        return { action: 'browse', params: { iterations: 10 } };
      } else {
        // Click on another article
        return { action: 'click', params: { selector: 'article a[href], .post a[href], [role="article"] a[href]' } };
      }
    }
    
    // Priority 3: Comment sections (engage)
    if (pageContent.hasCommentSection && rand < 0.2) {
      return { action: 'comment', params: { text: 'Interesting perspective!' } };
    }
    
    // Priority 4: Links (navigation)
    if (pageContent.linkCount > 10) {
      if (rand < 0.6) {
        return { action: 'browse', params: { iterations: 8 } };
      } else {
        // Click a random link to navigate
        return { action: 'click', params: { selector: 'a[href]:not([href*="google.com"]):not([href="#"])' } };
      }
    }
    
    // Priority 5: Search functionality
    if (pageContent.hasSearchBox && rand < 0.3) {
      const searchTerms = ['latest news', 'trending', 'popular', 'new', 'best'];
      const term = searchTerms[Math.floor(Math.random() * searchTerms.length)];
      return { action: 'search', params: { keyword: term } };
    }
    
    // Fallback: Just browse
    return { action: 'browse', params: { iterations: 5 } };
  }

  /**
   * Fallback action when no content scan available
   */
  _getFallbackAction() {
    const rand = Math.random();
    if (rand < 0.7) {
      return { action: 'browse', params: { iterations: 8 } };
    } else {
      return { action: 'click', params: { selector: 'a[href]:not([href*="google.com"])' } };
    }
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
