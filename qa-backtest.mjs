import { chromium } from 'playwright';

const VIEWPORTS = [
  { name: '320', width: 320, height: 568 },
  { name: '360', width: 360, height: 640 },
  { name: '390', width: 390, height: 844 },
  { name: '412', width: 412, height: 915 },
];

const base = 'http://localhost:3000';
const shots = './qa-shots';
const fs = await import('node:fs');
fs.mkdirSync(shots, { recursive: true });

const browser = await chromium.launch({ headless: true });

const issues = [];

for (const v of VIEWPORTS) {
  const ctx = await browser.newContext({
    viewport: { width: v.width, height: v.height },
    isMobile: true,
    hasTouch: true,
    deviceScaleFactor: 2,
  });
  const page = await ctx.newPage();
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(String(e)));

  // Skip onboarding so we can reach the backtest terminal immediately
  await page.goto(`${base}/backtest`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.evaluate(() => {
    localStorage.setItem('onboardingCompleted', 'true');
    localStorage.setItem('i18nextLng', 'id');
  });
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(3000);

  await page.screenshot({ path: `${shots}/backtest-${v.name}.png`, fullPage: false });

  const overflow = await page.evaluate(() => {
    const doc = document.documentElement;
    return { scrollW: doc.scrollWidth, clientW: doc.clientWidth, overflow: doc.scrollWidth > doc.clientWidth };
  });

  const chartBox = await page.evaluate(() => {
    const el = document.querySelector('.mobile-terminal-chart canvas') || document.querySelector('.mobile-terminal-chart');
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { w: Math.round(r.width), h: Math.round(r.height) };
  });

  const actions = await page.evaluate(() => {
    const buy = document.querySelector('.mobile-action-buy');
    const sell = document.querySelector('.mobile-action-sell');
    const iconBtns = document.querySelectorAll('.mobile-icon-btn');
    return { buy: !!buy, sell: !!sell, iconBtns: iconBtns.length };
  });

  console.log(`[${v.name}] overflow=${overflow.overflow} chart=${JSON.stringify(chartBox)} actions=${JSON.stringify(actions)} errors=${errors.length}`);
  if (overflow.overflow) issues.push(`${v.name}: horizontal overflow scrollW=${overflow.scrollW} > clientW=${overflow.clientW}`);
  if (!chartBox || chartBox.h < 200) issues.push(`${v.name}: chart too small or missing (h=${chartBox ? chartBox.h : 0})`);
  if (errors.length) issues.push(`${v.name}: console/pageerrors: ${errors.slice(0,3).join(' | ')}`);

  await ctx.close();
}

await browser.close();

if (issues.length) {
  console.log('\nISSUES:\n- ' + issues.join('\n- '));
  process.exit(1);
} else {
  console.log('\nAll viewports OK.');
}
