const { chromium } = require('playwright');

async function runAudit(url) {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const startTime = Date.now();

  const errors = [];
  page.on('pageerror', (err) => errors.push(err.message));

  try {
    const response = await page.goto(url, { waitUntil: 'domcontentloaded' });
    const duration = Date.now() - startTime;

    const title = await page.title();
    let description = '';
    try {
      description = await page.$eval(
        'meta[name="description"]',
        (el) => el.content
      );
    } catch {}

    await browser.close();

    return {
      url,
      status: response.status(),
      duration,
      title,
      description: description || 'No meta description found.',
      jsErrors: errors,
    };
  } catch (err) {
    await browser.close();
    return { error: 'Failed to audit site: ' + err.message };
  }
}

module.exports = runAudit;
