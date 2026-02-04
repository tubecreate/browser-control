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

  console.log(`Action: SEARCH '${keyword}'`);

  // STRATEGY 1: Check if keyword is a URL -> Navigate directly
  const isUrl = /^(http|https):\/\/[^ "]+$/.test(keyword) || /^[a-zA-Z0-9-]+\.(com|net|org|io|vn)(\/[^ "]+)?$/.test(keyword);
  
  if (isUrl) {
      let targetUrl = keyword;
      if (!targetUrl.startsWith('http')) targetUrl = 'https://' + targetUrl;
      console.log(`Detected URL: ${targetUrl}. Navigating directly...`);
      try {
          await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
          console.log('Navigation complete.');
          
          // Optional: handle consents popup (e.g. generic cookies)
          try {
             const consent = await page.getByRole('button', { name: /Accept|Agree|Consent|Đồng ý/i }).first();
             if (await consent.isVisible()) await consent.click();
          } catch(e) {}
          
          return; // Done
      } catch (e) {
          console.warn(`Direct navigation failed: ${e.message}. Falling back to search.`);
      }
  }

  // STRATEGY 2: Contextual Search (Search ON the current site)
  // If we are NOT on Google/Bing/Yahoo, try to find an internal search bar first
  const currentUrl = page.url();
  const isSearchEngine = currentUrl.includes('google.com') || currentUrl.includes('bing.com') || currentUrl.includes('search.yahoo');
  
  if (!isSearchEngine && currentUrl !== 'about:blank') {
      console.log(`Attempting internal search on ${new URL(currentUrl).hostname}...`);
      try {
          // Common internal search selectors
          const searchSelectors = [
              'input[type="search"]',
              'input[name="q"]', // GitHub, Google
              'input[name="query"]',
              'input[placeholder*="Search" i]',
              'input[placeholder*="Tìm" i]',
              'button[aria-label="Search"]', // Sometimes a button opens a modal
              'svg[aria-label="Search"]'
          ];
          
          let searchInput = null;
          for (const sel of searchSelectors) {
              const el = page.locator(sel).first();
              if (await el.isVisible()) {
                  searchInput = el;
                  break;
              }
          }

          if (searchInput) {
              console.log('Found internal search input. Typing query...');
              await searchInput.click();
              await searchInput.fill(''); // clear potential text
              
              // Human-like typing
              for (const char of keyword) {
                   await page.keyboard.type(char, { delay: 50 + Math.random() * 50 });
              }
              await page.waitForTimeout(500);
              await page.keyboard.press('Enter');
              console.log('Internal search executed.');
              await page.waitForTimeout(2000); // Wait for internal results
              return;
          } else {
              console.warn('No internal search bar found. Falling back to Google.');
          }
      } catch (e) {
          console.warn(`Internal search failed: ${e.message}. Falling back to Google.`);
      }
  }

  // STRATEGY 3: Google Search (Fallback)
  console.log('Performing Google Search...');
  
  // Navigate to Google if not already there
  if (!page.url().includes('google.com')) {
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
  await searchBox.fill(''); 
  
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
