import axios from 'axios';

const LOCAL_AI_URL = 'http://localhost:5295/api/v1/localai/chat/completions';

/**
 * Action: Post a context-aware comment on a YouTube video.
 * @param {import('playwright').Page} page
 * @param {object} params
 */
export async function comment(page, params = {}) {
  console.log('Preparing to post a comment...');

  // 1. Ensure we are on a YouTube video page
  if (!page.url().includes('youtube.com/watch')) {
    console.warn('Comment action skipped: Not a YouTube video page.');
    return;
  }

  // 1.5 Check if logged in (YouTube requires login to comment)
  const isLoggedIn = await page.locator('button#avatar-btn').first().isVisible();
  if (!isLoggedIn) {
    console.error('Comment action failed: Not logged in. Please ensure login happens before commenting.');
    throw new Error('NOT_LOGGED_IN_ON_YOUTUBE');
  }

  try {
    // 2. Scrape Metadata (Title and Description)
    console.log('Scraping video metadata...');
    const metadata = await page.evaluate(() => {
      // Robust selectors for YouTube's dynamic layout
      const titleEl = document.querySelector('#title h1 yt-formatted-string') 
                   || document.querySelector('#title h1') 
                   || document.querySelector('h1.ytd-watch-metadata');
                   
      const descEl = document.querySelector('#description-inline-expander') 
                  || document.querySelector('#description-inner') 
                  || document.querySelector('#description');
                  
      return { 
        title: titleEl ? titleEl.innerText.trim() : '', 
        description: descEl ? descEl.innerText.trim() : '' 
      };
    });

    console.log(`Scraped Title: "${metadata.title}"`);

    if (!metadata.title) {
      console.warn('Could not find video title, skipping comment.');
      return;
    }

    // 3. Generate Comment via Local AI
    console.log('Generating context-aware comment...');
    const systemPrompt = `You are a smart YouTube viewer interacting with a video titled "${metadata.title}".
    
Task: Write a short, engaging comment in Vietnamese (1-2 sentences) that specifically references the content mentioned in the title.
- Do NOT be generic (avoid "Video hay quá", "Cảm ơn bạn").
- Mention specific keywords from the title.
- Tone: Friendly, appreciative, slightly curious.

Example Title: "Cách làm bánh mì nướng" -> Comment: "Nhìn bánh mì nướng giòn rụm ngon quá, công thức này có khó làm không bạn?"
Example Title: "Review xe VinFast VF3" -> Comment: "Con VF3 này nhìn nhỏ gọn mà thiết kế đẹp ghê, không biết pin đi thực tế được bao xa nhỉ?"`;

    const response = await axios.post(LOCAL_AI_URL, {
      model: 'deepseek-chat',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: `Hãy viết bình luận cho video: ${metadata.title}` }
      ],
      stream: false,
      temperature: 0.7
    }, { timeout: 30000 }).catch(e => {
        console.warn(`AI Generation failed: ${e.message}. Using fallback.`);
        // Fallback that at least tries to seem relevant if scraping worked
        return { 
            data: { 
                choices: [{ 
                    message: { 
                        content: `Bài viết về ${metadata.title} này rất hữu ích, cảm ơn bạn đã chia sẻ!` 
                    } 
                }] 
            } 
        };
    });

    const commentText = response.data.choices[0].message.content.trim().replace(/^"|"$/g, '');
    console.log(`Generated Comment: "${commentText}"`);

    // 4. Scroll to Comment Section (YouTube lazy-loads this)
    console.log('Scrolling down to find comment section...');
    const commentBoxSelector = '#placeholder-area';
    let found = false;
    for (let i = 0; i < 5; i++) {
      await page.evaluate(() => window.scrollBy(0, 800));
      await page.waitForTimeout(2000);
      if (await page.locator(commentBoxSelector).isVisible()) {
        found = true;
        break;
      }
    }
    
    if (!found) {
        console.warn('Comment box not found after scrolling. Video might have comments disabled or load very slowly.');
    }
    
    // Wait for comment box to be ready
    await page.waitForSelector(commentBoxSelector, { timeout: 10000 });
    
    // 5. Click and Type Comment
    console.log('Entering comment...');
    await page.click(commentBoxSelector);
    await page.waitForSelector('#contenteditable-root');
    
    await page.waitForTimeout(1500 + Math.random() * 2500);
    for (const char of commentText) {
      await page.keyboard.type(char, { delay: 60 + Math.random() * 200 });
    }
    await page.waitForTimeout(1000 + Math.random() * 1000);
    
    // 6. Final Click on Submit
    console.log('Submitting comment...');
    const submitBtn = page.locator('#submit-button').first();
    if (await submitBtn.isVisible()) {
        await submitBtn.click();
        console.log('Comment submitted successfully.');
    } else {
        console.warn('Submit button not found or not visible.');
    }

  } catch (error) {
    console.error('Comment action failed:', error.message);
  }
}
