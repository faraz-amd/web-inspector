// utils/audit.js
import chalk from 'chalk';
import ora from 'ora';
import boxen from 'boxen';
import figlet from 'figlet';
import logSymbols from 'log-symbols';
import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';

const OUTPUT_PATH = path.join(process.cwd(), 'audit-result.txt');

console.log(
  chalk.cyanBright(
    figlet.textSync('Web Inspector', { horizontalLayout: 'fitted' })
  )
);

const spinner = ora('Launching browser...').start();

const url = process.argv[2];
if (!url) {
  console.error('Error: No URL provided. Usage: node utils/audit.js <url>');
  process.exit(1);
}

// Modularized checks
async function runChecks(page) {
  const title = await page.title();
  const titleLength = title.length;
  const hasMetaDesc = (await page.$('meta[name="description"]')) !== null;
  const metaDesc = hasMetaDesc
    ? await page.$eval('meta[name="description"]', (el) => el.content)
    : '';
  const metaDescLength = metaDesc.length;
  const canonical = await page
    .$eval('link[rel="canonical"]', (el) => el.href)
    .catch(() => '');
  const h1Count = await page.$$eval('h1', (els) => els.length);
  const h1Text =
    h1Count > 0 ? await page.$eval('h1', (el) => el.textContent.trim()) : '';
  const robotsMeta = await page
    .$eval('meta[name="robots"]', (el) => el.content)
    .catch(() => '');
  const hasSchema =
    (await page.$('script[type="application/ld+json"]')) !== null;

  return {
    title,
    titleLength,
    hasMetaDesc,
    metaDesc,
    metaDescLength,
    canonical,
    h1Count,
    h1Text,
    robotsMeta,
    hasSchema,
    seoIssues: [
      !title
        ? 'Missing <title> tag.'
        : titleLength < 10 || titleLength > 70
        ? 'Title length should be 10-70 characters.'
        : '',
      !hasMetaDesc
        ? 'Missing meta description.'
        : metaDescLength < 50 || metaDescLength > 160
        ? 'Meta description length should be 50-160 characters.'
        : '',
      !canonical ? 'Missing canonical link.' : '',
      h1Count === 0
        ? 'Missing <h1> tag.'
        : h1Count > 1
        ? 'Multiple <h1> tags found.'
        : '',
      !robotsMeta ? 'Missing robots meta tag.' : '',
      !hasSchema ? 'Missing structured data (schema.org).' : '',
    ].filter(Boolean),
  };
}

// Scrape all links (href + text)
async function scrapeLinks(page) {
  return await page.$$eval('a', (links) =>
    links.map((a) => ({
      href: a.href,
      text: a.textContent.trim(),
    }))
  );
}

// Scrape all images (src + alt)
async function scrapeImages(page) {
  return await page.$$eval('img', (imgs) =>
    imgs.map((img) => ({
      src: img.src,
      alt: img.getAttribute('alt') || '',
      width: img.width,
      height: img.height,
    }))
  );
}

// Scrape meta tags (name/content and property/content)
async function scrapeMetaTags(page) {
  return await page.$$eval('meta', (metas) =>
    metas.map((meta) => ({
      name: meta.getAttribute('name') || meta.getAttribute('property') || '',
      content: meta.getAttribute('content') || '',
    }))
  );
}

async function runAccessibilityChecks(page) {
  // Images missing alt
  const images = await page.$$eval('img', (imgs) =>
    imgs.map((img) => ({
      src: img.src,
      alt: img.getAttribute('alt') || '',
    }))
  );
  const imagesMissingAlt = images.filter((img) => !img.alt.trim());

  // ARIA roles
  const ariaRoles = await page.$$eval('[role]', (els) =>
    els.map((el) => el.getAttribute('role'))
  );

  // Basic color contrast check (text vs background)
  const contrastIssues = await page.$$eval('*', (els) => {
    function luminance(r, g, b) {
      const a = [r, g, b].map((v) => {
        v /= 255;
        return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
      });
      return 0.2126 * a[0] + 0.7152 * a[1] + 0.0722 * a[2];
    }
    function hexToRgb(hex) {
      hex = hex.replace('#', '');
      if (hex.length === 3)
        hex = hex
          .split('')
          .map((x) => x + x)
          .join('');
      const num = parseInt(hex, 16);
      return [num >> 16, (num >> 8) & 255, num & 255];
    }
    let issues = [];
    els.forEach((el) => {
      const style = window.getComputedStyle(el);
      if (
        style.color &&
        style.backgroundColor &&
        style.color !== style.backgroundColor
      ) {
        let fg = style.color.match(/^rgb/) ? style.color : null;
        let bg = style.backgroundColor.match(/^rgb/)
          ? style.backgroundColor
          : null;
        if (fg && bg) {
          const fgVals = fg.match(/\d+/g).map(Number);
          const bgVals = bg.match(/\d+/g).map(Number);
          const lum1 = luminance(...fgVals);
          const lum2 = luminance(...bgVals);
          const contrast =
            (Math.max(lum1, lum2) + 0.05) / (Math.min(lum1, lum2) + 0.05);
          if (contrast < 4.5) {
            issues.push(el.textContent.trim().slice(0, 30));
          }
        }
      }
    });
    return issues;
  });

  // Keyboard navigation: check for focusable elements
  const focusableCount = await page.$$eval(
    'a, button, input, textarea, select, [tabindex]',
    (els) => els.length
  );

  return {
    imagesMissingAlt,
    ariaRoles,
    contrastIssues,
    focusableCount,
    accessibilityIssues: [
      imagesMissingAlt.length > 0
        ? `${imagesMissingAlt.length} images missing alt text.`
        : '',
      ariaRoles.length === 0 ? 'No ARIA roles found.' : '',
      contrastIssues.length > 0
        ? `${contrastIssues.length} elements with low color contrast.`
        : '',
      focusableCount === 0
        ? 'No focusable elements for keyboard navigation.'
        : '',
    ].filter(Boolean),
  };
}

(async () => {
  let browser;
  try {
    spinner.text = `Navigating to ${chalk.underline(url)}`;
    browser = await chromium.launch();
    const page = await browser.newPage();
    try {
      await page.goto(url, { waitUntil: 'networkidle', timeout: 15000 });
    } catch (navErr) {
      spinner.fail(chalk.red('Navigation failed: ') + navErr.message);
      await browser.close();
      process.exit(1);
    }
    spinner.succeed('Page loaded');
    spinner.start('Running checks...');

    // Run checks
    const results = await runChecks(page);

    await new Promise((res) => setTimeout(res, 500)); // simulate work
    spinner.succeed('Checks complete');

    // Scrape links, images, meta tags
    spinner.start('Scraping page elements...');
    const [links, images, metaTags] = await Promise.all([
      scrapeLinks(page),
      scrapeImages(page),
      scrapeMetaTags(page),
    ]);
    spinner.succeed('Scraping complete');

    // Accessibility checks
    spinner.start('Running accessibility checks...');
    const accessibility = await runAccessibilityChecks(page);
    spinner.succeed('Accessibility checks complete');

    // Prepare summary and details for file
    let fileContent = '';
    fileContent += `Title: ${results.title}\n`;
    fileContent += `Meta Description: ${
      results.hasMetaDesc ? 'Present' : 'Missing'
    }\n`;
    fileContent += `H1 Tags: ${results.h1Count}\n`;
    fileContent += `Links: ${results.linksCount}\n`;
    fileContent += `Images: ${results.imagesCount}\n`;
    fileContent += `Images with alt: ${results.imagesWithAlt}\n`;
    fileContent += `Accessibility Issues (missing alt): ${results.accessibilityIssues}\n\n`;

    fileContent += `Links on page:\n`;
    links.forEach((link, i) => {
      fileContent += `${i + 1}. ${link.text || '[No text]'} - ${link.href}\n`;
    });

    fileContent += `\nImages on page:\n`;
    images.forEach((img, i) => {
      fileContent += `${i + 1}. src: ${img.src}, alt: ${img.alt}, size: ${
        img.width
      }x${img.height}\n`;
    });

    fileContent += `\nMeta tags:\n`;
    metaTags.forEach((meta, i) => {
      fileContent += `${i + 1}. ${meta.name}: ${meta.content}\n`;
    });

    fileContent += `\nSEO Audit:\n`;
    fileContent += `Title: ${results.title} (${results.titleLength} chars)\n`;
    fileContent += `Meta Description: ${
      results.hasMetaDesc ? 'Present' : 'Missing'
    } (${results.metaDescLength} chars)\n`;
    fileContent += `Canonical URL: ${results.canonical || 'Missing'}\n`;
    fileContent += `H1 Tags: ${results.h1Count}\n`;
    fileContent += `H1 Text: ${results.h1Text}\n`;
    fileContent += `Robots Meta: ${results.robotsMeta || 'Missing'}\n`;
    fileContent += `Structured Data: ${
      results.hasSchema ? 'Present' : 'Missing'
    }\n`;
    fileContent += `SEO Issues:\n`;
    results.seoIssues.forEach((issue, i) => {
      fileContent += `  ${i + 1}. ${issue}\n`;
    });
    fileContent += `\n`;

    fileContent += `Accessibility Audit:\n`;
    fileContent += `Images missing alt: ${accessibility.imagesMissingAlt.length}\n`;
    if (accessibility.imagesMissingAlt.length > 0) {
      accessibility.imagesMissingAlt.forEach((img, i) => {
        fileContent += `  ${i + 1}. src: ${img.src}\n`;
      });
    }
    fileContent += `ARIA roles found: ${accessibility.ariaRoles.length}\n`;
    if (accessibility.ariaRoles.length > 0) {
      fileContent += `  Roles: ${accessibility.ariaRoles.join(', ')}\n`;
    }
    fileContent += `Elements with low color contrast: ${accessibility.contrastIssues.length}\n`;
    if (accessibility.contrastIssues.length > 0) {
      accessibility.contrastIssues.forEach((txt, i) => {
        fileContent += `  ${i + 1}. "${txt}"\n`;
      });
    }
    fileContent += `Focusable elements for keyboard navigation: ${accessibility.focusableCount}\n`;
    fileContent += `Accessibility Issues:\n`;
    accessibility.accessibilityIssues.forEach((issue, i) => {
      fileContent += `  ${i + 1}. ${issue}\n`;
    });
    fileContent += `\n`;

    fs.writeFileSync(OUTPUT_PATH, fileContent);

    // Output JSON for API/server
    const output = {
      ...results,
      links,
      images,
      metaTags,
    };
    // If running as a child process, output JSON for server
    if (process.env.FOR_API === '1') {
      console.log(JSON.stringify(output));
    }

    await browser.close();
    spinner.succeed(
      `✅ Audit & scraping completed. Results saved to ${OUTPUT_PATH}`
    );
  } catch (err) {
    spinner.fail(chalk.red('Audit failed: ') + err.message);
    console.error(chalk.red('Error details:'), err);
    process.exit(1);
  }
})();
