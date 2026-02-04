import { humanMove } from './mouse_helper.js';

/**
 * Action: Click on a specific element or the first search result.
 * @param {import('playwright').Page} page
 * @param {object} params
 * @param {string} [params.selector] - CSS selector to click. If not provided, clicks first search result.
 * @param {string} [params.type] - Type of target (e.g. 'video').
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
  } else if (params.text) {
    console.log(`Searching for element with text: "${params.text}"`);
    // Try multiple strategies for text matching
    // 1. Exact/Partial text match
    target = page.getByText(params.text, { exact: false }).first();
  } else if (params.type === 'video') {
    // Target video results: STRICT YouTube links or video thumbnails
    // Avoid Clicking "AI Overview" or "People also ask"
    const videoSelectors = [
        'a[href*="youtube.com/watch"]', // Direct video links
        'div[data-surl*="youtube.com/watch"] a', // Video type results
        'video-voyager a'
    ];
    target = page.locator(videoSelectors.join(',')).first();
    console.log('Searching for STRICT video results (youtube.com)...');
  } else {
    // Default to first Google result if no selector
    // Try multiple strategies to find the first clickable search result
    console.log('Finding first search result using multiple strategies...');
    
    const strategies = [
      // Strategy 1: Standard search result link (.g is Google's result container)
      '#search .g a[href]:not([href*="google.com"])',
      // Strategy 2: Any link in search results area (broader)
      '#search a[href]:not([href*="google.com"]):not([href*="#"])',
      // Strategy 3: Main region links (fallback for different layouts)
      '[role="main"] a[href]:not([href*="google.com"]):not([href*="#"])',
      // Strategy 4: Any h3 link (headline links)
      'h3 a[href]:not([href*="google.com"])'
    ];
    
    // Try strategies with retry logic
    let maxAttempts = 3;
    let attemptDelay = 2000; // Wait 2 seconds between attempts
    
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      if (attempt > 0) {
        console.log(`Retry attempt ${attempt}/${maxAttempts - 1} - waiting ${attemptDelay}ms for results...`);
        await page.waitForTimeout(attemptDelay);
      }
      
      for (const selector of strategies) {
        const candidate = page.locator(selector).first();
        if (await candidate.isVisible()) {
          target = candidate;
          console.log(`Found target using selector: ${selector}`);
          break;
        }
      }
      
      if (target) {
        break; // Found target, exit retry loop
      }
    }
    
    if (!target) {
      console.warn('No suitable search result found with any strategy after retries. Using first strategy as final attempt.');
      target = page.locator(strategies[0]).first();
      // Wait a bit more for it to appear
      await page.waitForTimeout(3000);
    }
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
    const msg = `Target element '${selector || 'default'}' not visible.`;
    console.warn(msg);
    throw new Error(msg);
  }
}
