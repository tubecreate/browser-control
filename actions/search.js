import { waitForCaptcha, detectCaptcha } from './captcha_helper.js';

async function handleCaptcha(page, isRetry) {
  if (await detectCaptcha(page)) {
    if (isRetry) {
      await waitForCaptcha(page);
    } else {
      throw new Error('CAPTCHA_DETECTED');
    }
  }
}

/**
 * Action: Search for a keyword on Google
 * @param {import('playwright').Page} page
 * @param {object} params
 * @param {string} params.keyword - The search query.
 */
export async function search(page, params) {
  const { keyword } = params;
  if (!keyword) throw new Error('Keyword is required for search action');

  console.log(`Searching for "${keyword}"...`);
  
  // Navigate to Google if not already there
  if (!page.url().includes('google.com')) {
    // networkidle is flaky on Google; use domcontentloaded + selector wait
    await page.goto('https://www.google.com', { waitUntil: 'domcontentloaded', timeout: 30000 });
    try {
      await page.waitForSelector('textarea[name="q"], input[name="q"]', { timeout: 10000 });
    } catch (e) {
      console.warn('Search input not found after navigation, continuing anyway...');
    }
  }
  
  await handleCaptcha(page, params.isRetry);

  // Handle potential cookie consent
  try {
    const consentButton = await page.getByRole('button', { name: /Accept all|Tôi đồng ý/i }).first();
    if (await consentButton.isVisible()) {
      await consentButton.click();
    }
  } catch (e) {}

  const searchBox = page.locator('textarea[name="q"], input[name="q"]');
  await searchBox.click();
  
  // Human-like typing
  for (const char of keyword) {
    await page.keyboard.type(char, { delay: 50 + Math.random() * 100 });
  }
  
  await page.waitForTimeout(500);
  await page.keyboard.press('Enter');
  
  // --- CAPTCHA DETECTION ---
  await handleCaptcha(page, params.isRetry);

  await page.waitForSelector('#search', { timeout: 10000 }).catch(() => {
    console.warn('Search results took too long to load or blocked by Captcha.');
  });
  console.log('Search results loaded.');
}
