/**
 * Action to save images from the page
 * Ensure we capture the final HIGH-RESOLUTION version, not the blurry preview.
 * @param {import('playwright').Page} page 
 * @param {object} params { selector, index }
 * @returns {Promise<{path: string, url: string}>}
 */
export async function save_image(page, params = {}) {
  const { selector, index = 0 } = params;
  
  console.log('[SAVE_IMAGE] Waiting 30s for generation and high-res rendering...');
  await page.waitForTimeout(30000);
  
  // Wait for network to be idle to ensure high-res image is fully downloaded
  console.log('[SAVE_IMAGE] Waiting for network idle...');
  await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => console.log('[SAVE_IMAGE] Network idle timeout (ignoring)'));

  // 1. Wait for "Loading" indicators to disappear (shimmers, pulsing bars, etc.)
  const loadingSelectors = [
      '.ant-skeleton', '[class*="loading"]', '[class*="progress"]', 
      '.shimmer', '.pulse', 'text="Generating"', 'text="Loading"',
      '.loading-spinner'
  ];
  
  for (const sel of loadingSelectors) {
      try {
          await page.waitForSelector(sel, { state: 'hidden', timeout: 30000 });
      } catch (e) {}
  }

  // 2. Poll for the largest image that is FULLY LOADED and High-Res
  let bestImg = null;
  const startTime = Date.now();
  const timeout = 60000; 

  while (Date.now() - startTime < timeout) {
      bestImg = await page.evaluate(() => {
          const imgs = Array.from(document.querySelectorAll('img'));
          const candidates = imgs.map(img => ({
              src: img.src,
              width: img.naturalWidth,
              height: img.naturalHeight,
              area: img.naturalWidth * img.naturalHeight,
              complete: img.complete
          })).filter(img => img.area > 250000 && img.complete && img.width > 800); // 800px+ for high res
          
          if (candidates.length === 0) return null;
          candidates.sort((a, b) => b.area - a.area);
          return candidates[0];
      });

      if (bestImg) break;
      await page.waitForTimeout(5000);
  }

  if (bestImg) {
      console.log(`[SAVE_IMAGE] SUCCESS: High-res image detected (${bestImg.width}x${bestImg.height})`);
      
      // Final stabilize
      await page.waitForTimeout(10000);

      const imgElement = await page.$(`img[src="${bestImg.src}"]`);
      if (imgElement) {
          const timestamp = new Date().getTime();
          const filename = `saved_image_${timestamp}.png`;
          const savePath = `./downloads/${filename}`;
          
          const fs = await import('fs-extra');
          await fs.ensureDir('./downloads');
          
          await imgElement.screenshot({ path: savePath });
          console.log(`[SAVE_IMAGE] Image saved to: ${savePath}`);
          
          return {
              path: savePath,
              url: bestImg.src,
              width: bestImg.width,
              height: bestImg.height
          };
      }
  }

  console.warn('[SAVE_IMAGE] No high-res image found after 60s polling.');
  return null;
}
