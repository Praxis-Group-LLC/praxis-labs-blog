// Capture genuine, unauthenticated product landing pages for the public portfolio.
// Run on a clean browser context. Do not use credentials, cookies, or test accounts.
import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';

const targets = [
  { name: 'Molly\'s Learning Arcade', url: 'https://mollyslearningarcade.com/', file: 'molly-overview.png', host: 'mollyslearningarcade.com' },
  { name: 'Praxis Studio', url: 'https://praxis-studio.app/', file: 'praxis-overview.png', host: 'praxis-studio.app' },
];

const directory = resolve('public/projects');
await mkdir(directory, { recursive: true });
const browser = await chromium.launch({ headless: true });
let failures = 0;
try {
  for (const target of targets) {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, colorScheme: 'dark' });
    try {
      const page = await context.newPage();
      const response = await page.goto(target.url, { waitUntil: 'domcontentloaded', timeout: 45000 });
      const pageUrl = new URL(page.url());
      const expected = [target.host, `www.${target.host}`];
      if (!expected.includes(pageUrl.hostname)) throw new Error('Unexpected redirect host');
      if (/\/(login|sign-in|signin|auth)(\/|$)/i.test(pageUrl.pathname)) throw new Error('Redirected to authentication');
      if (!response || !response.ok()) throw new Error(`HTTP ${response?.status() ?? 'unknown'}`);
      await page.locator('body').waitFor({ state: 'visible', timeout: 15000 });
      await page.waitForTimeout(2500);
      const visible = await page.locator('body').innerText();
      if (visible.trim().length < 35) throw new Error('Landing page did not display enough readable content');
      await page.screenshot({ path: resolve(directory, target.file), fullPage: false, animations: 'disabled' });
      console.log(`Captured ${target.name}: ${page.url()} — title: ${await page.title()}`);
    } catch (error) {
      failures++;
      console.error(`No verified screenshot for ${target.name}: ${error.message}`);
    } finally {
      await context.close();
    }
  }
} finally {
  await browser.close();
}
if (failures) process.exitCode = 1;
