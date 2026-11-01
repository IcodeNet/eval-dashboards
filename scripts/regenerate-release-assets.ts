import { mkdir, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { chromium } from 'playwright';

const __filename = fileURLToPath(import.meta.url);
const repoRoot = path.resolve(path.dirname(__filename), '..');

const run = async (command: string, args: string[]): Promise<void> => {
  await new Promise<void>((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: repoRoot,
      stdio: 'inherit',
      shell: process.platform === 'win32',
    });

    child.on('error', reject);
    child.on('exit', (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`Command failed (${code ?? 'unknown'}): ${command} ${args.join(' ')}`));
    });
  });
};

const toFileUrl = (absolutePath: string): string => {
  const normalized = absolutePath.replace(/\\/g, '/');
  return `file://${normalized}`;
};

const captureScreenshot = async (
  browser: Awaited<ReturnType<typeof chromium.launch>>,
  htmlPath: string,
  screenshotPath: string,
  options: { width?: number; height?: number; colorScheme?: 'light' | 'dark' } = {},
): Promise<void> => {
  const page = await browser.newPage({
    viewport: { width: options.width ?? 1680, height: options.height ?? 1100 },
    colorScheme: options.colorScheme ?? 'light',
  });
  await page.goto(toFileUrl(htmlPath), { waitUntil: 'load' });
  await page.screenshot({ path: screenshotPath, fullPage: true });
  await page.close();
};

const main = async (): Promise<void> => {
  await run('node', ['--import', 'tsx/esm', 'scripts/generate-screenshot-fixture.ts']);

  await run('pnpm', [
    'dev',
    'report',
    '--input=examples/screenshot-fixture/.evals_output',
    '--run-id=agent-v4-2026-07-31',
    '--baseline-run-id=agent-v3-2026-07-30',
    '--reporter=html',
    '--reporter=json-summary',
    '--report-dir=eval-report',
    '--theme=default',
  ]);

  await run('pnpm', [
    'dev',
    'report',
    '--input=examples/screenshot-fixture/.evals_output',
    '--run-id=agent-v4-2026-07-31',
    '--baseline-run-id=agent-v3-2026-07-30',
    '--reporter=html',
    '--reporter=json-summary',
    '--report-dir=eval-report-dark',
    '--theme=dark',
  ]);

  await run('node', ['--import', 'tsx/esm', 'scripts/generate-history-fixture.ts']);
  const historyDir = path.join(repoRoot, 'examples', 'screenshot-fixture');
  const historyInput = path.join(historyDir, 'history-input');
  const historySqlite = path.join(historyDir, 'history.sqlite');
  await rm(historySqlite, { force: true });
  await run('pnpm', ['dev', 'history', `--input=${historyInput}`, `--out=${historySqlite}`]);
  await run('pnpm', ['dev', 'history-report', `--input=${historySqlite}`, '--out=eval-report/history-trend.html']);
  await run('pnpm', [
    'dev', 'history-report', `--input=${historySqlite}`, '--branch=main', '--suite=tool-use',
    '--since=2026-03-01', '--out=eval-report/history-trend-filtered.html',
  ]);
  await run('pnpm', [
    'dev', 'history-report', `--input=${historySqlite}`, '--keep-last=8',
    '--out=eval-report/history-trend-recent.html',
  ]);

  await run('node', ['examples/paired-comparison/generate.mjs', '.tmp/paired-input']);
  await run('pnpm', ['dev', 'report', '--input=.tmp/paired-input', '--reporter=html',
    '--report-dir=.tmp/paired-report', '--paired-min-delta=0', '--paired-min-clusters=20',
    '--assume-independent-clusters']);

  await mkdir(path.join(repoRoot, 'docs', 'images'), { recursive: true });

  const browser = await chromium.launch();
  try {
    await captureScreenshot(
      browser,
      path.join(repoRoot, 'eval-report', 'index.html'),
      path.join(repoRoot, 'docs', 'images', 'report-default.png'),
    );

    await captureScreenshot(
      browser,
      path.join(repoRoot, 'eval-report-dark', 'index.html'),
      path.join(repoRoot, 'docs', 'images', 'report-dark.png'),
    );
    await captureScreenshot(
      browser,
      path.join(repoRoot, 'eval-report', 'history-trend.html'),
      path.join(repoRoot, 'docs', 'images', 'history-trend.png'),
      { width: 1100, height: 900 },
    );
    await captureScreenshot(
      browser,
      path.join(repoRoot, 'eval-report', 'history-trend-filtered.html'),
      path.join(repoRoot, 'docs', 'images', 'history-trend-filtered.png'),
      { width: 1100, height: 900 },
    );
    await captureScreenshot(
      browser,
      path.join(repoRoot, 'eval-report', 'history-trend-recent.html'),
      path.join(repoRoot, 'docs', 'images', 'history-trend-recent.png'),
      { width: 1100, height: 900 },
    );
    await captureScreenshot(
      browser,
      path.join(repoRoot, 'eval-report', 'history-trend.html'),
      path.join(repoRoot, 'docs', 'images', 'history-trend-dark.png'),
      { width: 1100, height: 900, colorScheme: 'dark' },
    );
    await captureScreenshot(
      browser,
      path.join(repoRoot, '.tmp', 'paired-report', 'index.html'),
      path.join(repoRoot, 'docs', 'images', 'paired-comparison.png'),
    );
  } finally {
    await browser.close();
  }
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
