import path from 'node:path';
import { chromium } from 'playwright';

const root = process.cwd();
const reportHtml = path.resolve(root, 'examples/report-power-artifacts/report/index.html');
const outDir = path.resolve(root, 'docs/images');

const targets = {
  progress: path.join(outDir, 'report-power-progress.png'),
  history: path.join(outDir, 'report-power-history.png'),
  gating: path.join(outDir, 'report-power-gating.png'),
  detail: path.join(outDir, 'report-power-detail.png'),
};

const sectionIdsToExpand = ['gate-policy', 'failing-rows'];

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1600, height: 1200 } });

await page.goto(`file://${reportHtml}`);
await page.waitForTimeout(300);

for (const sectionId of sectionIdsToExpand) {
  await page.evaluate((id) => {
    const section = document.querySelector<HTMLElement>(`[data-section-id="${id}"]`);
    if (!section) return;
    section.classList.remove('collapsed');
    const toggle = section.querySelector<HTMLElement>('.section-toggle');
    if (toggle) toggle.setAttribute('aria-expanded', 'true');
    const icon = section.querySelector<HTMLElement>('.section-toggle-icon');
    if (icon) icon.textContent = '▾';
    const body = section.querySelector<HTMLElement>('.section-body');
    if (body) {
      body.hidden = false;
      body.style.display = 'block';
    }
  }, sectionId);
}

await page.waitForTimeout(150);

await page.locator('.metrics').first().screenshot({ path: targets.progress });
await page.locator('[data-section-id="pass-rate-trend"]').first().screenshot({ path: targets.history });
await page.locator('[data-section-id="gate-policy"]').first().screenshot({ path: targets.gating });
await page.locator('[data-section-id="failing-rows"]').first().screenshot({ path: targets.detail });

await browser.close();

for (const [name, p] of Object.entries(targets)) {
  console.log(`${name}: ${p}`);
}
