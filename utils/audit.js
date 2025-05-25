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

const url = process.argv[2] || 'https://example.com';

try {
  spinner.text = `Navigating to ${chalk.underline(url)}`;

  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.goto(url, { waitUntil: 'networkidle' });

  spinner.succeed('Page loaded');
  spinner.start('Running basic checks...');

  const title = await page.title();
  const hasMetaDesc = (await page.$('meta[name="description"]')) !== null;

  await new Promise((res) => setTimeout(res, 1000)); // simulate work
  spinner.succeed('Basic checks complete');

  console.log(
    boxen(
      [
        `${logSymbols.success} Title: ${chalk.green(title)}`,
        `${
          hasMetaDesc ? logSymbols.success : logSymbols.error
        } Meta Description: ${
          hasMetaDesc ? chalk.green('Present') : chalk.red('Missing')
        }`,
      ].join('\n'),
      {
        padding: 1,
        margin: 1,
        borderStyle: 'round',
        borderColor: 'blue',
      }
    )
  );

  await browser.close();
  console.log(chalk.green('✅ Audit completed successfully'));
} catch (err) {
  spinner.fail(chalk.red('Audit failed: ') + err.message);
  process.exit(1);
}
