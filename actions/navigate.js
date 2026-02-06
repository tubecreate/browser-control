
/**
 * Generic Navigation Action
 * @param {import('playwright').Page} page 
 * @param {object} params { url }
 */
export async function navigate(page, params) {
  const { url } = params;
  if (!url) throw new Error('Navigate action: URL is required');
  
  console.log(`[NAVIGATE] Going to: ${url}...`);
  
  // Basic URL cleanup
  let targetUrl = url.trim();
  
  // Detect if this is a "search query" disguised as a URL (e.g. "grok tạo ảnh")
  const isLikelySearch = targetUrl.includes(' ') || (!targetUrl.includes('.') && !targetUrl.includes('localhost'));
  
  if (isLikelySearch) {
      console.log(`[NAVIGATE] "${targetUrl}" looks like a search term. Redirecting to search...`);
      const searchUrl = `https://www.google.com/search?q=${encodeURIComponent(targetUrl)}`;
      await page.goto(searchUrl, { waitUntil: 'domcontentloaded' });
      return;
  }

  if (!targetUrl.startsWith('http')) {
      targetUrl = `https://${targetUrl}`;
  }

  try {
    console.log(`[NAVIGATE] Going to: ${targetUrl}...`);
    // Wait for networkidle to ensure heavy SPA apps like Grok/Twitter/Gmail are actually usable
    await page.goto(targetUrl, { waitUntil: 'load', timeout: 60000 });
    await page.waitForLoadState('networkidle').catch(() => console.log('[NAVIGATE] Network not idle, but continuing...'));
  } catch (err) {
    console.error(`[NAVIGATE] Failed to go to ${targetUrl}: ${err.message}`);
    const searchUrl = `https://www.google.com/search?q=${encodeURIComponent(url)}`;
    console.log(`[NAVIGATE] Falling back to search: ${searchUrl}`);
    await page.goto(searchUrl, { waitUntil: 'domcontentloaded' });
  }
  
  // Wait for a bit more to be sure
  await page.waitForTimeout(3000);
  
  console.log(`[NAVIGATE] Arrived at: ${page.url()}`);
}
