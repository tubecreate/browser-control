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

// Action Registry
const ACTION_REGISTRY = {
  search: searchAction.search,
  browse: browseAction.browse,
  click: clickAction.click,
  login: loginAction.login,
  comment: commentAction.comment,
  visual_scan: visualScanAction.visual_scan
};

/**
 * Main Orchestrator
 */
async function main() {
  const args = minimist(process.argv.slice(2));
  const keyword = args.keyword || '';
  const actionsArg = args.action || '';
  const prompt = args.prompt || '';
  const isNewProfile = args['new-profile'] || false;

  // 1. Determine Action Sequence & Profile Override
  let actionSequence = [];
  let profileName = args.profile || 'default';

  if (prompt) {
    const ai = new AIEngine();
    const result = await ai.planActions(prompt);
    actionSequence = result.actions;
    if (result.profile) {
      console.log(`\n>>> Profile switch requested via prompt: ${result.profile}`);
      profileName = result.profile;
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

  const profilePath = path.resolve(`./profiles/${profileName}`);
  console.log(`Target Profile: ${profileName} (${profilePath})`);

  // --- Multi-Attempt Logic ---
  let attempt = 1;
  const maxAttempts = 2;
  let success = false;

  while (attempt <= maxAttempts && !success) {
    let context;
    let page;
    const isRetry = attempt > 1;

    try {
      console.log(`\n=== Execution Attempt ${attempt} (isRetry: ${isRetry}) ===`);

      // Handle profile clearing on retry or specific request
      if ((isNewProfile || isRetry) && fs.existsSync(profilePath)) {
        console.log(`Cleaning up profile at ${profilePath}...`);
        try {
          await fs.remove(profilePath);
        } catch (e) {
          console.warn(`Could not remove profile directory: ${e.message}`);
        }
      }

      // 2. Browser Initialization
      console.log('Fetching fingerprint...');
      plugin.setServiceKey('');
      const fingerprint = await plugin.fetch({
        tags: ['Microsoft Windows', 'Chrome'],
      });

      console.log('Applying fingerprint and launching browser...');
      plugin.useFingerprint(fingerprint);

      context = await plugin.launchPersistentContext(profilePath, {
        headless: false,
        args: ['--start-maximized'],
      });

      page = context.pages()[0] || await context.newPage();

      // --- MOUSE VISUALIZATION ---
      await page.addInitScript(() => {
        window.addEventListener('DOMContentLoaded', () => {
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

      // 3. Execute Action Sequence
      // 3. Execute Action Sequence
      for (const step of actionSequence) {
        const actionFn = ACTION_REGISTRY[step.action];
        if (actionFn) {
          console.log(`\n--- Executing: ${step.action} ---`);
          try {
            // Pass isRetry down to actions
            await actionFn(page, { ...step.params, isRetry });
          } catch (actionError) {
            console.error(`Error in action '${step.action}': ${actionError.message}`);
            
            // --- SELF-HEALING LOGIC ---
            console.log('Attempting Visual Error Diagnosis...');
            const { diagnoseAndSuggest } = await import('./vision_engine.js');
            const suggestion = await diagnoseAndSuggest(page, `Execute action: ${step.action} with params ${JSON.stringify(step.params)}`, actionError.message);
            
            if (suggestion && ACTION_REGISTRY[suggestion.action]) {
              console.log(`\n>>> SELF-HEALING: Executing alternative action: ${suggestion.action} <<<`);
              const remedialFn = ACTION_REGISTRY[suggestion.action];
              await remedialFn(page, { ...suggestion.params, isRetry });
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
      success = true;

    } catch (error) {
      if (error.message === 'CAPTCHA_DETECTED' && attempt < maxAttempts) {
        console.error('\n>>> CAPTCHA detected on first attempt. Clearing profile and retrying once...');
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
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
