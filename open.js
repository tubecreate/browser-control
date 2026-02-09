import { plugin } from 'playwright-with-fingerprints';
import minimist from 'minimist';
import fs from 'fs-extra';
import path from 'path';
import { AIEngine } from './ai_engine.js';
import * as searchAction from './actions/search.js';
import * as browseAction from './actions/browse.js';
import * as clickAction from './actions/click.js';
import * as loginAction from './actions/login.js';
import * as commentAction from './actions/comment.js';
import * as visualScanAction from './actions/visual_scan.js';
import * as watchAction from './actions/watch.js';
import * as navigateAction from './actions/navigate.js';
import * as typeAction from './actions/type.js';
import * as saveImageAction from './actions/save_image.js';
import { BrowserManager } from './browser_manager.js';
import { SessionManager } from './session_manager.js';
import axios from 'axios';

// Helper: Report Status to Web Manager
async function reportStatus(args, data) {
    if (!args['instance-id']) return;
    try {
        await axios.post('http://localhost:3000/api/browser-status', {
            instanceId: args['instance-id'],
            profile: args.profile,
            ...data
        });
    } catch (e) {
        // Ignore connection errors
    }
}

// Action Registry
const ACTION_REGISTRY = {
  navigate: navigateAction.navigate,
  type: typeAction.type,
  save_image: saveImageAction.save_image,
  search: searchAction.search,
  browse: browseAction.browse,
  click: clickAction.click,
  login: loginAction.login,
  comment: commentAction.comment,
  watch: watchAction.watch,
  visual_scan: visualScanAction.visual_scan
};

/**
 * Main Orchestrator
 */
async function main() {
  const args = minimist(process.argv.slice(2));
  console.log('RAW ARGV:', process.argv);
  console.log('PARSED ARGS:', JSON.stringify(args));
  const keyword = args.keyword || '';
  const actionsArg = args.action || '';
  const prompt = args.prompt || '';
  const isNewProfile = args['new-profile'] || false;
  const exportCookies = args['export-cookies'] || false;
  const isManual = args['manual'] || false;
  const isHeadless = args['headless'] || false; // Run browser in headless mode
  const sessionMode = args['session'] || false; // Enable generative session mode
  const minSessionMinutes = parseInt(args['session-duration']) || 10;
  const aiModel = args['ai-model'] || 'deepseek-r1:latest'; // NEW: AI model for browser automation
  const cliTags = args['tags']; // Raw CLI arg for overrides
  const proxy = args['proxy'] || ''; // NEW: Proxy support
  const instanceId = args['instance-id'] || null; // Instance ID from BrowserProcessManager
  
  // Log instance ID if provided (for multi-instance tracking)
  if (instanceId) {
    console.log(`[InstanceID] ${instanceId}`);
  }

  // 1. Determine Action Sequence & Profile Override
  let actionSequence = [];
  let profileName = args.profile || 'default';
  
  if (!exportCookies && !isManual) { // Skip planning if exporting cookies or manual mode
      if (prompt) { 
        // OPTIMIZATION: If prompt looks like a structured command (contains 'then'), skip AI planning
        if (prompt.includes(', then ') || prompt.includes(', and then ')) {
            console.log('>>> Detected structured prompt. Skipping AI planning for speed.');
            // Simple heuristic parsing
            actionSequence = prompt.split(/, then |, and then /).map(step => {
                const s = step.trim().toLowerCase();
                let action = 'browse';
                let params = {};
                
                if (s.startsWith('search for ')) {
                    action = 'search';
                    params = { keyword: s.replace('search for ', '').replace(/'/g, '') };
                } else if (s.includes('click')) {
                    action = 'click';
                    // Support variations: 'click first result', 'click result', 'click [text]'
                    if (s.includes('first result')) {
                        params = { element: 'first result' };
                    } else if (s.includes('result')) {
                        params = { element: 'result' };
                    } else {
                        params = { element: s.replace('click ', '') };
                    }
                } else if (s.startsWith('read')) {
                    action = 'browse'; // Map 'read' to 'browse'
                    const match = s.match(/(\d+) seconds/);
                    params = { duration: match ? parseInt(match[1]) : 60 };
                } else if (s.startsWith('watch')) {
                    action = 'watch';
                    const match = s.match(/(\d+) seconds/);
                    params = { duration: match ? parseInt(match[1]) : 60 };
                } else if (s.includes('browse')) {
                    action = 'browse';
                    const match = s.match(/(\d+) seconds/);
                    params = { duration: match ? parseInt(match[1]) : 60 };
                }
                
                return { action, params };
            });
            
            // Default profile if not specified
            if (!profileName || profileName === 'default') {
                // If we skipped AI, we don't get a profile suggestion, so keep current
            }
        } else {
            // Complex/Unstructured prompt -> Use AI
            console.log('>>> Analyzing prompt with AI...');
            const ai = new AIEngine(aiModel);
            const result = await ai.planActions(prompt);
            actionSequence = result.actions;
            
            console.log('\n--- 🤖 AI PLANNED ACTIONS ---');
            actionSequence.forEach((step, idx) => {
                 console.log(`${idx + 1}. [${step.action.toUpperCase()}] ${JSON.stringify(step.params)}`);
            });
            console.log('-----------------------------\n');
    
            if (result.profile && !args.profile) {
              console.log(`\n>>> Profile switch requested via prompt: ${result.profile}`);
              profileName = result.profile;
            } else if (result.profile && args.profile) {
              console.log(`\n>>> AI suggested profile '${result.profile}' but keeping CLI override '${args.profile}'`);
            }
        }
      } else if (actionsArg) {
        actionSequence = actionsArg.split(',').map(name => ({
          action: name.trim(),
          params: { keyword }
        }));
      } else {
        actionSequence = [
          { action: 'search', params: { keyword: 'playwright automation' } },
          { action: 'browse', params: { iterations: 3 } }
        ];
      }
      
      if (args['dry-run']) {
          console.log('Detected --dry-run flag. Exiting after planning.');
          process.exit(0);
      }
  }



  const browserManager = new BrowserManager();
  console.log(`Target Profile: ${profileName}`);

  // --- Multi-Attempt Logic ---
  let attempt = 1;
  const maxAttempts = 3;
  let success = false;

  while (attempt <= maxAttempts && !success) {
    let context;
    let page;
    const isRetry = attempt > 1;

    try {
      console.log(`\n=== Execution Attempt ${attempt} (isRetry: ${isRetry}) ===`);

      // Handle profile clearing only if explicitly requested
      if (isNewProfile && !exportCookies) {
          await browserManager.cleanProfile(profileName);
      }

      // 2. Browser Initialization
      console.log('Fetching fingerprint...');
      let fingerprint;
      try {
          // Determine tags
          let tags = cliTags ? cliTags.split(',').map(t => t.trim()) : null;
          fingerprint = await browserManager.getFingerprint(profileName, { tags });
      } catch (e) {
          console.warn('Fingerprint issue:', e.message);
          if (attempt < maxAttempts) {
             throw new Error('FINGERPRINT_RETRY');
          }
      }

      console.log('Launching browser...');
      context = await browserManager.launch(profileName, {
          headless: !!exportCookies,
          fingerprint,
          proxy,
          args: [
              '--remote-debugging-port=0' // Force random port
          ]
      });

      // Ensure a page exists immediately
      page = context.pages()[0] || await context.newPage();

      // --- COOKIE EXPORT ---
      if (exportCookies) {
          const cookies = await context.cookies();
          console.log('__COOKIES_START__');
          console.log(JSON.stringify(cookies));
          console.log('__COOKIES_END__');
          await context.close();
          return process.exit(0);
      }

      // --- MOUSE VISUALIZATION HELPER ---
      // Use addInitScript to ensure visualization persists across navigations and tabs
      await context.addInitScript(() => {
        window.addEventListener('DOMContentLoaded', () => {
          if (document.getElementById('mouse-pointer-visualization')) return;
          const box = document.createElement('div');
          box.id = 'mouse-pointer-visualization';
          box.style.position = 'fixed';
          box.style.top = '0';
          box.style.left = '0';
          box.style.width = '20px';
          box.style.height = '20px';
          box.style.background = 'rgba(255, 0, 0, 0.7)';
          box.style.borderRadius = '50%';
          box.style.pointerEvents = 'none';
          box.style.zIndex = '9999999';
          box.style.transition = 'transform 0.1s linear';
          document.body.appendChild(box);
          document.addEventListener('mousemove', (e) => {
            box.style.transform = `translate(${e.clientX - 10}px, ${e.clientY - 10}px)`;
          });
        });
      });

      // --- TAB MANAGEMENT ---
      // Listen for new pages (tabs) and switch focus
      context.on('page', async (newPage) => {
        console.log('[TabManager] New tab detected! Switching focus...');
        page = newPage; // Update the main page reference
        console.log(`[TabManager] Now on: ${page.url()}`);
      });

      // --- BACKGROUND IP & LOCATION CHECK ---
      // 1. Expose a binding to receive data from the browser context
      await context.exposeBinding('reportPublicIP', async ({ page }, data) => {
          console.log(`[Info] 🌍 Location Detected: ${data.ip} (${data.city}, ${data.country})`);
          await reportStatus(args, { 
              ip: data.ip, 
              city: data.city, 
              country: data.country,
              server_time: data.timezone?.current_time || null,
              status: 'connected' 
          });
      });

      // 2. Inject script to fetch location data on every page load
      await context.addInitScript(() => {
          // Avoid running in iframes
          if (window.self !== window.top) return;

          // Only run once per page load
          if (window._ipCheckStarted) return;
          window._ipCheckStarted = true;

          console.log('[Auto-IP] Checking location...');
          
          fetch('https://ipwho.is/')
              .then(res => res.json())
              .then(data => {
                  if (data.success !== false) {
                      window.reportPublicIP(data);
                  } else {
                      console.warn('[Auto-IP] Service failed:', data.message);
                      // Fallback to simple IP
                      return fetch('https://api.ipify.org?format=json')
                        .then(r => r.json())
                        .then(d => window.reportPublicIP({ ip: d.ip, city: 'Unknown', country: 'Unknown' }));
                  }
              })
              .catch(err => console.warn('[Auto-IP] Network error:', err));
      });

      // 3. Manual Mode Check
      if (isManual) {
        console.log('>>> MANUAL MODE: Browser launched. Waiting for user to close window...');
        
        // Navigate to google if on about:blank
        if (page.url() === 'about:blank') {
            await page.goto('https://www.google.com');
        }

        // Loop to check if context is still open
        while (context.pages().length > 0) {
            await new Promise(r => setTimeout(r, 1000));
        }
        console.log('Browser closed by user.');
        return process.exit(0);
      }

      // 4. Execute Action Sequence (Only if NOT in session mode)
      if (!sessionMode) {
        let initialActionsSucceeded = true;
        const results = [];
        for (const step of actionSequence) {
          const actionFn = ACTION_REGISTRY[step.action];
          if (actionFn) {
            console.log(`\n--- Executing: ${step.action} ---`);
            try {
              // Pass isRetry down to actions
              const result = await actionFn(page, { ...step.params, isRetry });
              if (result) {
                results.push({ action: step.action, result });
              }
            } catch (actionError) {
              console.error(`Error in action '${step.action}': ${actionError.message}`);
              
              // --- SELF-HEALING LOGIC ---
              console.log('Attempting Visual Error Diagnosis...');
              const { diagnoseAndSuggest } = await import('./vision_engine.js');
              const suggestion = await diagnoseAndSuggest(page, `Execute action: ${step.action} with params ${JSON.stringify(step.params)}`, actionError.message);
              
              if (suggestion && ACTION_REGISTRY[suggestion.action]) {
                console.log(`\n>>> SELF-HEALING: Executing alternative action: ${suggestion.action} <<<`);
                const remedialFn = ACTION_REGISTRY[suggestion.action];
                const remedialResult = await remedialFn(page, { ...suggestion.params, isRetry });
                if (remedialResult) {
                    results.push({ action: suggestion.action, result: remedialResult, healed: true });
                }
                console.log('>>> Remedial action completed. Resuming sequence. <<<\n');
              } else {
                console.warn('No effective remedial action found. Propagating error.');
                throw actionError;
              }
            }
          } else {
            console.warn(`Unknown action: ${step.action}`);
          }
        }
        console.log('\nAll actions completed successfully.');
        console.log('__RESULTS_START__');
        console.log(JSON.stringify(results, null, 2));
        console.log('__RESULTS_END__');
      }
      
      // 5. Session Mode - Continue generating actions until minimum duration reached
      if (sessionMode) {
        // 5. Start Session Mode (if enabled)
        // Parse model from args, default to qwen:latest if not set
        const aiModel = args.model || 'qwen:latest';
        const minSessionMinutes = parseInt(args['session-duration']) || 10;
        
        console.log(`\n=== SESSION MODE ENABLED (${minSessionMinutes} min minimum) ===\n`);
        
        // Use the original prompt as the User Goal
        const userGoal = prompt || "Browse naturally and interestingly";
        
        // Load Agent Context from file if provided
        let agentContext = null;
        if (args['context-file']) {
            try {
                if (await fs.pathExists(args['context-file'])) {
                    agentContext = await fs.readJson(args['context-file']);
                    console.log(`[Session] Loaded agent context for: ${agentContext.agent_name}`);
                }
            } catch (e) {
                console.error('[Session] Failed to load context file:', e.message);
            }
        }

        const session = new SessionManager(minSessionMinutes, userGoal, aiModel, agentContext);
        
        console.log(`\n>>> STARTING SESSION MODE (${minSessionMinutes} min) with Model: ${aiModel} <<<`);
        console.log(`Goal: "${userGoal}"`);
        
        // Navigate to a starter page if on about:blank to give the session context
        if (page.url() === 'about:blank') {
           console.log('[Session] Starting from blank page. Navigating to Google...');
           await page.goto('https://www.google.com', { waitUntil: 'domcontentloaded' });
        }

        session.start(page.url(), userGoal, actionSequence);
        
        // Status reporting loop (every 5 seconds) - lightweight, no screenshots
        const statusInterval = setInterval(async () => {
          try {
            if (!page || page.isClosed()) {
              clearInterval(statusInterval);
              return;
            }
            
            const currentUrl = page.url();
            const status = session.getStatus();
            
            // Send status update to server for dashboard
            try {
              const fetch = (await import('node-fetch')).default;
              await fetch('http://localhost:3000/api/browser-status', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                  instanceId,
                  profile: profileName,
                  url: currentUrl,
                  status: session.currentContext?.pageType || 'browsing',
                  actionCount: status.actionsCompleted,
                  lastAction: `${status.elapsedMinutes}/${minSessionMinutes} min`
                })
              });
            } catch (e) {
              // Server not available, skip
            }
          } catch (e) {
            // Status update failed
          }
        }, 5000);
        
        while (!session.hasReachedMinimum()) {
          try {
            // Safety check: is browser still connected?
            const browserInstance = context.browser();
            if (browserInstance && !browserInstance.isConnected()) {
              throw new Error('BROWSER_DISCONNECTED');
            }

            // Page Recovery: If page was closed (e.g. by ChatGPT glitch), recover
            if (!page || page.isClosed()) {
                const allPages = context.pages();
                if (allPages.length > 0) {
                    // Switch to the last available page (likely the original one)
                    page = allPages[allPages.length - 1];
                    console.log(`[TabManager] Recovered focus to existing tab: ${page.url()}`);
                    try { await page.bringToFront(); } catch(e) {}
                } else {
                    // No pages left, create new one
                    console.warn('[Session] All pages closed. Recreating main page...');
                    page = await context.newPage();
                    await page.goto('https://www.google.com', { waitUntil: 'domcontentloaded' });
                }
            }

            // Update context from current page
            try {
                session.updateContext(page.url());
            } catch (e) {
                // If accessing url fails, we might need one more check
                if (!page || page.isClosed()) continue; 
            }
            
            // Check if stuck on same URL
            if (session.isStuckOnSameUrl()) {
              console.log('[Session] Detected stuck on same URL. Triggering recovery...');
              throw new Error('Stuck on same URL - triggering recovery');
            }
            
            // DYNAMIC: Scan page content to detect available elements
            const pageContent = await session.scanPageContent(page);
            
            // Generate next action chain based on actual page content (await async AI generation)
            const actionChain = await session.generateNextAction(page, pageContent);
            
            if (!actionChain || !Array.isArray(actionChain) || actionChain.length === 0) {
              console.log('[Session] No more actions or invalid chain. Ending session.');
              break;
            }
            
            // Execute each action in the chain sequentially
            for (const nextAction of actionChain) {
              // Display session status for each step
              const status = session.getStatus();
              console.log(`\n[Session] ${status.elapsedMinutes}/${minSessionMinutes} min | Step: ${nextAction.action} (${status.actionsCompleted + 1}) | Page: ${status.pageType}`);
              
              // Execute the action
              let actionFn = ACTION_REGISTRY[nextAction.action];
              
              // Map 'read' to 'browse' if not explicitly defined
              if (!actionFn && nextAction.action === 'read') {
                  console.log('[Session] Mapping "read" action to "browse" implementation');
                  actionFn = ACTION_REGISTRY['browse'];
              }

              if (actionFn) {
                try {
                  await actionFn(page, { ...nextAction.params, isRetry });
                  session.recordAction(nextAction.action, nextAction.params);
                } catch (actionError) {
                  if (actionError.message === 'NO_VIDEO_FOUND') {
                    console.log('[Session] Fallback: No video found during watch. Switching to browse behavior...');
                    const browseFn = ACTION_REGISTRY['browse'];
                    if (browseFn) {
                      await browseFn(page, { iterations: 10 });
                      session.recordAction('browse', { iterations: 10, note: 'fallback from watch' });
                    }
                  } else {
                    console.warn(`[Session] Action error: ${actionError.message}. Skipping remaining chain.`);
                    break; // Stop current chain on error
                  }
                }
              } else {
                console.warn(`[Session] Unknown action: ${nextAction.action}`);
              }
              
              // Brief pause between steps for stability
              await page.waitForTimeout(2000);
              session.updateContext(page.url());
            }
            
          } catch (sessionError) {
            console.error(`[Session] Error during action: ${sessionError.message}`);
            
            // CRITICAL: Detect browser crash - cannot be recovered in-session
            if (sessionError.message.includes('Page crashed') || 
                sessionError.message.includes('Target crashed') ||
                sessionError.message.includes('Browser closed')) {
              console.error('[Session] CRITICAL: Browser crashed. Restarting browser required.');
              throw new Error('BROWSER_CRASHED'); // Signal outer retry loop to restart
            }
            
            console.log('[Session] Recovering by starting a new task...');
            
            // Recovery strategy: Navigate to a safe page and start fresh
            try {
              const currentUrl = page.url();
              
              // If we're stuck on an error page or the same URL, navigate to a fresh start
              if (sessionError.message.includes('Stuck on same URL') ||
                  sessionError.message.includes('not visible') || 
                  sessionError.message.includes('Target') || 
                  sessionError.message.includes('closed')) {
                const recoveryActions = [
                  { url: 'https://www.youtube.com', type: 'youtube_home' },
                  { url: 'https://news.google.com', type: 'news' },
                  { url: 'https://github.com/trending', type: 'github_general' }
                ];
                
                const recovery = recoveryActions[Math.floor(Math.random() * recoveryActions.length)];
                console.log(`[Session] Navigating to ${recovery.url} to recover...`);
                
                await page.goto(recovery.url, { waitUntil: 'domcontentloaded', timeout: 15000 });
                session.updateContext(recovery.url);
                session.resetStuckCounter(); // Reset stuck detection after recovery
                session.updateContext(page.url());
                
                console.log(`[Session] Recovery successful. Context: ${session.currentContext.pageType}`);
              }
            } catch (recoveryError) {
              console.warn(`[Session] Recovery navigation failed: ${recoveryError.message}`);
              
              // If recovery also fails with crash, propagate up
              if (recoveryError.message.includes('crashed')) {
                throw new Error('BROWSER_CRASHED');
              }
            }
            
            // Brief pause before continuing
            await page.waitForTimeout(3000);
          }
        }
        
        clearInterval(statusInterval);
        const finalStatus = session.end();
        console.log('\n=== SESSION COMPLETED ===');
        console.log(`Duration: ${finalStatus.elapsedMinutes} minutes`);
        console.log(`Actions: ${finalStatus.actionsCompleted}`);
        console.log(`Final URL: ${finalStatus.currentUrl}`);
      }
      
      success = true;

    } catch (error) {
      if (error.message === 'BROWSER_CRASHED' && attempt < maxAttempts) {
        console.error('\n>>> BROWSER CRASHED! Restarting with new fingerprint...');
        // Close current context if still available
        try {
          if (context) await context.close();
        } catch (e) {
          // Context already dead, ignore
        }
        attempt++;
      } else if (error.message === 'CAPTCHA_DETECTED' && attempt < maxAttempts) {
        console.error('\n>>> CAPTCHA detected on first attempt. Retrying...');
        attempt++;
      } else if (error.message === 'FINGERPRINT_RETRY' && attempt < maxAttempts) {
        console.error('\n>>> Retrying with fresh fingerprint...');
        attempt++;
      } else if ((error.message.includes('Page crashed') || error.message.includes('Target page, context or browser has been closed') || error.message.includes('Target closed') || error.message.includes('ERR_CONNECTION_TIMED_OUT')) && attempt < maxAttempts) {
        console.error(`\n>>> Browser Crash/Network Error detected: ${error.message}. Retrying...`);
        attempt++;
      } else if (error.message === 'CAPTCHA_TIMEOUT') {
        console.error('\n>>> Manual CAPTCHA resolution timed out. Closing...');
        break;
      } else {
        console.error('\nExecution failed:', error.message);
        break;
      }
    } finally {
      console.log('Closing browser in 5 seconds...');
      if (page && !page.isClosed()) {
        await page.waitForTimeout(5000);
      }
      if (typeof context !== 'undefined') {
        await context.close();
      }
    }
  }

  if (success) {
    process.exit(0);
  } else {
    console.error('\n>>> Process finished with FAILURE status.');
    console.log('Closing in 20 seconds...');
    setTimeout(() => process.exit(1), 20000);
  }
}

main().catch((err) => {
  console.error('\n!!! CRITICAL ERROR !!!');
  console.error(err);
  console.log('\nClosing in 20 seconds...');
  setTimeout(() => process.exit(1), 20000);
});
