import { humanMove } from './mouse_helper.js';

/**
 * Action: Simulate natural browsing behavior (scrolling and mouse movements).
 * @param {import('playwright').Page} page
 * @param {object} params
 * @param {number} [params.iterations=5] - Number of browsing cycles.
 */
export async function browse(page, params = {}) {
  const iterations = params.iterations || 5;
  console.log(`Simulating natural browsing (${iterations} iterations)...`);

  for (let i = 0; i < iterations; i++) {
    if (page.isClosed()) {
      console.warn('Page was closed, stopping browse action.');
      return;
    }

    // Random human-like move
    const x = Math.floor(Math.random() * 800) + 100;
    const y = Math.floor(Math.random() * 600) + 100;
    
    try {
      await humanMove(page, x, y);

      // Random scroll
      const scrollAmount = Math.floor(Math.random() * 400) + 100;
      await page.mouse.wheel(0, scrollAmount);
      console.log(`Scrolled down ${scrollAmount}px`);

      await page.waitForTimeout(1000 + Math.random() * 2000);
    } catch (e) {
      if (e.message.includes('Target page, context or browser has been closed')) {
        console.warn('Browser closed during browse loop.');
        return;
      }
      throw e;
    }
  }
}
