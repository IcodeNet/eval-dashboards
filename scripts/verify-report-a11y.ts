/**
 * Fails when the generated HTML report has accessibility violations that axe-core can detect
 * (colour contrast, landmarks, names). Runs the built-in themes against a deterministic fixture.
 * Run with: pnpm a11y:verify
 */
import { createRequire } from 'node:module';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { chromium } from 'playwright';

const require = createRequire(import.meta.url);
const axeSource = await readFile(require.resolve('axe-core/axe.min.js'), 'utf8');
const themes = ['default', 'dark', 'minimal'] as const;
const viewports = [
  { name: 'desktop', width: 1366, height: 900 },
  { name: 'mobile', width: 375, height: 812 },
] as const;

type AxeViolation = { id: string; impact: string | null; help: string; nodes: Array<{ target: string[] }> };
type AxeRun = { violations: AxeViolation[] };

const workDir = await mkdtemp(path.join(os.tmpdir(), 'a11y-verify-'));
const failures: string[] = [];

try {
  const browser = await chromium.launch();
  try {
    for (const theme of themes) {
      const reportDir = path.join(workDir, theme);
      execFileSync(
        'pnpm',
        [
          'dev', 'report', '--input=examples/basic-json', `--report-dir=${reportDir}`,
          '--reporter=html', `--theme=${theme}`,
        ],
        { stdio: 'ignore' },
      );
      for (const viewport of viewports) {
        const page = await browser.newPage({ viewport: { width: viewport.width, height: viewport.height } });
        await page.goto(`file://${path.join(reportDir, 'index.html')}`);
        await page.addScriptTag({ content: axeSource });
        const result = (await page.evaluate(
          'axe.run(document, { resultTypes: ["violations"] })',
        )) as AxeRun;
        for (const violation of result.violations) {
          const sample = violation.nodes.slice(0, 2).map((node) => node.target.join(' ')).join('; ');
          failures.push(`[${theme}/${viewport.name}] ${violation.id} x${violation.nodes.length}: ${violation.help} (${sample})`);
        }
        await page.close();
      }
    }
  } finally {
    await browser.close();
  }
} finally {
  await rm(workDir, { recursive: true, force: true });
}

if (failures.length > 0) {
  console.error(`Accessibility check failed:\n${failures.map((line) => `- ${line}`).join('\n')}`);
  process.exit(1);
}
console.log(`Accessibility verified: ${themes.length} themes x ${viewports.length} viewports, no axe violations.`);
