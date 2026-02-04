import { humanMove } from './mouse_helper.js';

/**
 * Action: Watch a video for a specified duration, handling ads and simulating human behavior.
 * @param {import('playwright').Page} page
 * @param {object} params
 * @param {string|number} [params.duration="60s"] - Duration to watch (e.g. "50-100s", "60", 60).
 * @param {boolean} [params.skipAds=true] - Whether to automatically skip ads.
 */
export async function watch(page, params = {}) {
  const durationParam = params.duration || '60s';
  const skipAds = params.skipAds !== false;

  // 1. Parse Duration
  let durationSeconds = 60;
  
  if (typeof durationParam === 'string') {
        if (durationParam.includes('%')) {
        // Percentage based duration (requires video metadata)
        console.log(`Percentage duration detected: ${durationParam}. Waiting for video metadata...`);
        try {
            await page.waitForSelector('video', { timeout: 10000 }); // Wait 10s for slow networks
            const videoDuration = await page.evaluate(async () => {
                const v = document.querySelector('video');
                if (!v) return 600; // Default if not found
                if (isNaN(v.duration) || v.duration === Infinity) {
                    // Try to wait a bit for metadata
                    await new Promise(r => setTimeout(r, 1000)); 
                }
                return v.duration || 600;
            });
            
            const pct = parseInt(durationParam) / 100;
            durationSeconds = Math.floor(videoDuration * pct);
            console.log(`Video duration: ${videoDuration}s. Calculated watch time (${durationParam}): ${durationSeconds}s`);
        } catch (e) {
            console.warn('Failed to get video duration for percentage calculation (timeout/error). Defaulting to 60s.');
            durationSeconds = 60;
        }
    } else {
        const rangeMatch = durationParam.match(/(\d+)-(\d+)/);
        if (rangeMatch) {
            const min = parseInt(rangeMatch[1]);
            const max = parseInt(rangeMatch[2]);
            durationSeconds = Math.floor(Math.random() * (max - min + 1)) + min;
        } else {
            durationSeconds = parseInt(durationParam) || 60;
        }
    }
  } else if (typeof durationParam === 'number') {
    durationSeconds = durationParam;
  }

  console.log(`Starting 'watch' action. Planning to watch for ~${durationSeconds} seconds.`);

  // 2. Ensure Video is Playing
  try {
    await page.waitForSelector('video', { timeout: 10000 }); // Wait 10s for playback
    const isPlaying = await page.evaluate(() => {
      const v = document.querySelector('video');
      return v && !v.paused;
    });

    if (!isPlaying) {
      console.log('Video paused, attempting to play...');
      await page.keyboard.press('k'); // YouTube shortcut for play/pause
      // Fallback click center
      const video = page.locator('video').first();
      if (await video.isVisible()) {
          const box = await video.boundingBox();
          if (box) await humanMove(page, box.x + box.width / 2, box.y + box.height / 2);
          await page.click('video');
      }
    }
  } catch (e) {
    console.warn('Could not confirm video playback, proceeding anyway:', e.message);
  }

  // 3. Watch Loop
  const startTime = Date.now();
  const endTime = startTime + (durationSeconds * 1000);

  while (Date.now() < endTime) {
    if (page.isClosed()) return;

    // A. Check for Ads
    if (skipAds) {
      await handleAds(page);
    }

    // B. Human Behavior (Randomly)
    if (Math.random() < 0.1) {
      // 10% chance to move mouse per second
      await randomMouseMove(page);
    }
    
    // C. Wait 1 second
    await page.waitForTimeout(1000);
    
    // Log progress every 10s
    const elapsed = Math.floor((Date.now() - startTime) / 1000);
    if (elapsed > 0 && elapsed % 10 === 0) {
        console.log(`Watched for ${elapsed}/${durationSeconds}s...`);
    }
  }

  console.log('Watch action completed.');
}

async function handleAds(page) {
    try {
        // Common YouTube ad selectors
        const skipBtnSelectors = [
            '.ytp-ad-skip-button',
            '.ytp-ad-skip-button-modern',
            '.videoAdUiSkipButton',
            '.ytp-ad-overlay-close-button'
        ];

        for (const selector of skipBtnSelectors) {
            const btn = page.locator(selector).first();
            if (await btn.isVisible()) {
                console.log('Ad detected! Clicking skip button...');
                await btn.click();
                await page.waitForTimeout(500);
                return; // Skipped one, wait for loop
            }
        }
    } catch (e) {
        // Ignore errors during ad check (element might disappear)
    }
}

async function randomMouseMove(page) {
    const vp = page.viewportSize();
    if (!vp) return;
    
    const x = Math.floor(Math.random() * vp.width);
    const y = Math.floor(Math.random() * vp.height);
    await humanMove(page, x, y);
}
