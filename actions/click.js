import { humanMove } from './mouse_helper.js';

/**
 * Action: Click on a specific element or the first search result.
 * @param {import('playwright').Page} page
 * @param {object} params
 * @param {string} [params.selector] - CSS selector to click. If not provided, clicks first search result.
 */
export async function click(page, params = {}) {
  const { selector } = params;
  let target;
  
  // Ensure results are loaded if on Google
  if (page.url().includes('google.com/search')) {
    await page.waitForSelector('#search', { timeout: 10000 }).catch(() => {});
  }

  if (selector) {
    target = page.locator(selector).first();
  } else if (params.type === 'video') {
    // Target video results: YouTube links or video thumbnails
    // More robust selectors for video results
    target = page.locator('a[href*="youtube.com/watch"], a[href*="/url?q=https://www.youtube.com"], .X9p9S a, g-video-player a, video-voyager a').first();
    console.log('Searching for video results...');
  } else {
    // Default to first Google result if no selector
    target = page.locator('#search h3').first();
  }

  if (await target.isVisible()) {
    console.log('Clicking on target element...');
    const box = await target.boundingBox();
    if (box) {
      await humanMove(page, box.x + box.width / 2, box.y + box.height / 2);
      await page.waitForTimeout(500);
      await target.click();
      console.log('Click executed.');

      // --- Post-Click Video Handling ---
      if (params.type === 'video') {
        try {
          console.log('Waiting for video page to stabilize...');
          await page.waitForTimeout(5000); // Give it more time to load
          
          if (page.url().includes('youtube.com/watch')) {
            console.log('Detected YouTube page, ensuring video is playing...');
            
            // Multiple attempts to play
            for (let attempt = 0; attempt < 3; attempt++) {
              const isPlaying = await page.evaluate(async () => {
                const video = document.querySelector('video');
                if (video && video.paused) {
                  // Attempt 1: DOM play()
                  video.play().catch(() => {});
                  
                  // Attempt 2: Click the player
                  const moviePlayer = document.querySelector('#movie_player');
                  if (moviePlayer) moviePlayer.click();

                  // Attempt 3: Click large play button
                  const playBtn = document.querySelector('.ytp-large-play-button');
                  if (playBtn && playBtn.offsetParent !== null) {
                    playBtn.click();
                  }
                  return false;
                }
                return !!video && !video.paused;
              });

              if (isPlaying) {
                console.log('Video is confirmed playing.');
                break;
              }
              await page.waitForTimeout(2000);
            }
          }
        } catch (e) {
          console.warn('Video playback check failed:', e.message);
        }
      }
    }
  } else {
    console.warn('Target element not visible, skipping click.');
  }
}
