import axios from 'axios';

/**
 * Session Manager for Generative Browser Sessions
 * Maintains minimum 10-minute browsing sessions with context-aware action chaining
 */

export class SessionManager {
  constructor(minDurationMinutes = 10, userGoal = null, aiModel = 'qwen:latest') {
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
    this.aiModel = aiModel; // NEW: Configurable AI model
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
          
        // Captcha Detection
        const hasCaptcha = 
          document.querySelectorAll('iframe[src*="recaptcha"]').length > 0 ||
          document.querySelectorAll('iframe[src*="cloudflare"]').length > 0 ||
          document.querySelector('#captcha') !== null ||
          bodyText.includes("Verify you are human") ||
          bodyText.includes("security check");
        
        // Extract Interactive Elements (links, buttons) for AI selection
        const interactiveElements = [];
        const targets = document.querySelectorAll('a[href], button, input[type="submit"], [role="button"]');
        
        let count = 0;
        for (const el of targets) {
          if (count >= 30) break; // Limit to 30 to save tokens
          
          // Simple visibility check
          const rect = el.getBoundingClientRect();
          const text = el.innerText?.trim() || el.textContent?.trim() || '';
          
          if (rect.width > 0 && rect.height > 0 && text.length > 2) {
            interactiveElements.push({
              text: text.substring(0, 80), // Truncate long text
              tag: el.tagName.toLowerCase(),
              href: el.href || null
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
          interactiveElements, // NEW: List of clickable elements
          hasVideo: interactiveVideoCount > 0, // Only true for real videos
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

    const prompt = `You are an autonomous browser agent.
User Goal: "${this.userGoal}"
Current Context: ${JSON.stringify(context, null, 2)}${contextHint}

${hasElements ? `AVAILABLE INTERACTIVE ELEMENTS (links/buttons on page):
${elementList}
` : 'No interactive elements detected on page.'}

INSTRUCTIONS:
1. Choose the NEXT action to progress towards the goal.
2. IF clicking: YOU MUST use the EXACT "text" from the list above (not selector).
3. IF on a news site, blog, or article (e.g. Investopedia, CNN): Use 'browse' with iterations 5-10 to read the content. 
4. IF on YouTube search results: CLICK a video title to watch it.
5. IF watching video (inside video page): Use 'watch' with a reasonable duration like "60s" or "30%".
6. IF searching: Use simple keywords.

Available actions:
- search { "keyword": "..." }
- click { "text": "EXACT TEXT FROM LIST" }
- browse { "iterations": 5-10 }
- watch { "duration": "60s" }

Output JSON ONLY: { "action": "...", "params": { ... } }`;

    try {
      console.log(`[SessionManager] Requesting action from AI model: ${this.aiModel}...`);
      const response = await axios.post(this.aiUrl, {
        model: this.aiModel, // Use configured AI model
        messages: [{ role: "user", content: prompt }],
        stream: false,
        temperature: 0.7
      }, { timeout: 60000 }); // 60s timeout (qwen is fast)

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
