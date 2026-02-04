import { waitForCaptcha, detectCaptcha } from './captcha_helper.js';
import { humanMove } from './mouse_helper.js';

async function handleCaptcha(page, isRetry) {
  if (await detectCaptcha(page)) {
    if (isRetry) {
      await waitForCaptcha(page);
    } else {
      throw new Error('CAPTCHA_DETECTED');
    }
  }
}

async function humanClick(page, selector) {
  const element = page.locator(selector).first();
  if (await element.isVisible()) {
    const box = await element.boundingBox();
    if (box) {
      await humanMove(page, box.x + box.width / 2, box.y + box.height / 2);
      await page.waitForTimeout(300 + Math.random() * 500);
      await element.click();
    }
  }
}

/**
 * Action: Login to Google (or similar)
 * @param {import('playwright').Page} page
 * @param {object} params
 * @param {string} params.email
 * @param {string} params.password
 */
export async function login(page, params = {}) {
  const { email, password } = params;

  if (!email || !password) {
    console.error('Login error: Email and password are required.');
    return;
  }

  console.log(`Checking login status for: ${email}...`);

  try {
    // 0. Ensure we are on a valid domain to check cookies/session
    if (page.url() === 'about:blank' || page.url().startsWith('data:')) {
        console.log('Navigating to Google to check session...');
        await page.goto('https://www.google.com');
    }

    // 1. Initial check: Are we already logged in on the CURRENT site?
    console.log('Verifying session state...');
    await page.waitForTimeout(2000); // Wait for dynamic elements
    
    let isAlreadyLoggedIn = false;
    if (page.url().includes('youtube.com')) {
      // YouTube specific: #avatar-btn is the standard logged-in user menu
      isAlreadyLoggedIn = await page.locator('button#avatar-btn').first().isVisible();
    } else {
      // Google specific: .gb_A or a SignOut link
      isAlreadyLoggedIn = await page.locator('.gb_A, a[href*="SignOut"]').first().isVisible();
    }
    
    if (isAlreadyLoggedIn) {
      console.log('Detected active session on the current page. Skipping login as requested.');
      return;
    }

    // 2. Try to find a Sign-in button on the current page
    console.log('Looking for "Sign in" button...');
    const signInBtnSelector = [
      'a[href*="accounts.google.com/ServiceLogin"]',
      'a:has-text("Sign in")',
      'a:has-text("Đăng nhập")',
      'ytd-masthead #buttons ytd-button-renderer a',
      'tp-yt-paper-button:has-text("Sign in")',
      'button:has-text("Sign in")'
    ].join(', ');
    
    const signInBtn = page.locator(signInBtnSelector).first();
    
    if (await signInBtn.isVisible()) {
      console.log('Found Sign-in button on current page, clicking...');
      await humanClick(page, signInBtnSelector); // Use human click
    } else {
      // Navigate only if strictly needed
      if (!page.url().includes('accounts.google.com')) {
         console.log('No Sign-in button found on current page, navigating to Google Login...');
         await page.goto('https://accounts.google.com/signin');
      }
    }

    await handleCaptcha(page, params.isRetry);

    // 3. Enter Email
    console.log('Waiting for email input...');
    const emailSelector = 'input[type="email"], input[name="identifier"]';
    const emailInput = page.locator(emailSelector).first();
    await emailInput.waitFor({ state: 'visible', timeout: 20000 });
    
    await humanClick(page, emailSelector); // Human move then click
    
    await page.waitForTimeout(1000 + Math.random() * 2000);
    for (const char of email) {
      await page.keyboard.type(char, { delay: 50 + Math.random() * 150 });
    }
    
    await page.waitForTimeout(800 + Math.random() * 1200);
    const nextBtnSelector = '#identifierNext, button:has-text("Next"), button:has-text("Tiếp theo")';
    await humanClick(page, nextBtnSelector);
    console.log('Clicked "Next", waiting for transition...');

    // Login Error Check (Invalid Email / Phone)
    try {
      const errorMsg = page.locator('div.o6cu Mc, div[jsname="B34EJc"]').first(); // Common Google error containers
      if (await errorMsg.isVisible({ timeout: 3000 })) {
        const text = await errorMsg.innerText();
        console.error(`Login Error Detected: ${text}`);
        throw new Error(`LOGIN_ERROR: ${text}`);
      }
    } catch (e) {
      // Ignore timeout, meaning no error message found
    }

    await handleCaptcha(page, params.isRetry);

    // 4. Wait for Password field
    console.log('Waiting for password input...');
    // Exclude hidden inputs explicitly
    const passwordSelector = 'input[type="password"]:not([aria-hidden="true"]):not([name="hiddenPassword"])';
    const passwordInput = page.locator(passwordSelector).first();
    
    try {
        await passwordInput.waitFor({ state: 'visible', timeout: 30000 });
    } catch (e) {
        console.error('Password field did not appear. Check for captchas or alternative login screens.');
        throw e;
    }
    
    // Focus and type password
    await humanClick(page, passwordSelector);

    await page.waitForTimeout(1000 + Math.random() * 2000);
    for (const char of password) {
      await page.keyboard.type(char, { delay: 60 + Math.random() * 180 });
    }
    
    await page.waitForTimeout(1000 + Math.random() * 1500);
    const passwordNextSelector = '#passwordNext, button:has-text("Next"), button:has-text("Tiếp theo")';
    await humanClick(page, passwordNextSelector);
    console.log('Password entered.');

    // 5. Handle Challenges (Recovery Email)
    console.log('Checking for security challenges...');
    await page.waitForTimeout(3000 + Math.random() * 2000);
    
    // Check if we are on a challenge selection page
    const recoverySelector = 'div[data-challengetype="12"], li:has-text("Confirm your recovery email"), li:has-text("Xác nhận email khôi phục")';
    const recoveryOption = page.locator(recoverySelector).first();
    
    if (await recoveryOption.isVisible()) {
      console.log('Recovery email challenge detected.');
      if (params.recoveryEmail) {
        await humanClick(page, recoverySelector);
        
        const recoveryInputSelector = 'input[type="email"], input[name="knowledgePrereqResponse"]';
        const recoveryInput = page.locator(recoveryInputSelector).first();
        await recoveryInput.waitFor({ state: 'visible', timeout: 10000 });
        
        await humanClick(page, recoveryInputSelector);
        await page.waitForTimeout(1200 + Math.random() * 1800);
        
        for (const char of params.recoveryEmail) {
          await page.keyboard.type(char, { delay: 50 + Math.random() * 120 });
        }
        
        await page.waitForTimeout(1000 + Math.random() * 1000);
        const nextRecoverSelector = 'button:has-text("Next"), button:has-text("Tiếp theo")';
        await humanClick(page, nextRecoverSelector);
        console.log('Recovery email submitted.');
      } else {
        console.warn('Recovery email required but not provided in prompt.');
      }
    }

    // 5. Wait for navigation / success and ensure session is saved
    console.log('Waiting for login to stabilize...');
    await page.waitForSelector('#avatar-btn, .gb_A, ytd-topbar-menu-button-renderer img', { timeout: 20000 }).catch(() => {
      console.log('Avatar not found immediately, checking if stuck on challenge...');
    });
    
    await page.waitForTimeout(5000);
    console.log('Login attempt completed and session stabilized.');

  } catch (error) {
    console.error('Login process failed:', error.message);
    
    // Check for "unusual activity" or other blocks
    if (page.url().includes('challenge')) {
      console.warn('Detected a security challenge (Captcha/Phone). Manual intervention might be required.');
    }
    // Propagate for higher-level handling (retry logic)
    if (error.message.includes('CAPTCHA')) throw error;
  }
}
