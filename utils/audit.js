// utils/audit.js
import chalk from 'chalk';
import ora from 'ora';
import boxen from 'boxen';
import figlet from 'figlet';
import logSymbols from 'log-symbols';
import { chromium } from 'playwright';

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

(async () => {
  try {
    spinner.text = `Navigating to ${chalk.underline(url)}`;
    const browser = await chromium.launch();
    const page = await browser.newPage();
    await page.goto(url, { waitUntil: 'networkidle' });

    spinner.succeed('Page loaded');
    spinner.start('Running checks...');

    // Basic checks
    const title = await page.title();
    const hasMetaDesc = (await page.$('meta[name="description"]')) !== null;
    const h1Count = await page.$$eval('h1', els => els.length);
    const linksCount = await page.$$eval('a', els => els.length);
    const imagesCount = await page.$$eval('img', els => els.length);
    const imagesWithAlt = await page.$$eval('img', imgs => imgs.filter(img => img.hasAttribute('alt') && img.getAttribute('alt').trim() !== '').length);

    // Accessibility check
    const accessibilityIssues = imagesCount - imagesWithAlt;

    await new Promise((res) => setTimeout(res, 500)); // simulate work
    spinner.succeed('Checks complete');

    // Summary
    const summary = [
      `${logSymbols.success} Title: ${chalk.green(title)}`,
      `${hasMetaDesc ? logSymbols.success : logSymbols.error} Meta Description: ${hasMetaDesc ? chalk.green('Present') : chalk.red('Missing')}`,
      `${h1Count > 0 ? logSymbols.success : logSymbols.error} H1 Tag${h1Count !== 1 ? 's' : ''}: ${h1Count > 0 ? chalk.green(h1Count) : chalk.red('Missing')}`,
      `${logSymbols.info} Links: ${chalk.yellow(linksCount)}`,
      `${logSymbols.info} Images: ${chalk.yellow(imagesCount)}`,
      `${accessibilityIssues === 0 ? logSymbols.success : logSymbols.warning} Images with alt: ${chalk.green(imagesWithAlt)}${accessibilityIssues > 0 ? chalk.red(` (${accessibilityIssues} missing alt)`) : ''}`,
    ].join('\n');

    console.log(
      boxen(summary, {
        padding: 1,
        margin: 1,
        borderStyle: 'round',
        borderColor: accessibilityIssues === 0 ? 'blue' : 'red',
      })
    );

    await browser.close();
    console.log(chalk.green('✅ Audit completed successfully'));
  } catch (err) {
    spinner.fail(chalk.red('Audit failed: ') + err.message);
    console.error(chalk.red('Error details:'), err);
    process.exit(1);
  }
})();
