#!/usr/bin/env tsx
/**
 * Verify that the teaching curriculum's documented output matches reality.
 *
 * Why this exists: the exercises in docs/teach-exercises/ form a chain that
 * mutates one artifact. Each exercise documents the CLI output a learner should
 * see in a fenced ```text block. Those blocks were hand-written and drifted from
 * the real CLI: a 2026-09-15 audit found four exercises (06, 08, 09, 10) stating
 * warning counts, pass rates, lint breakdowns and exit codes the CLI never
 * produced, including one that claimed a gate passed when it actually failed.
 *
 * This script replays the chain in a temp dir and diffs documented expected
 * output against real stdout, so drift fails CI instead of reaching learners.
 *
 * Usage:
 *   pnpm teach:verify          # verify, non-zero exit on drift
 *   pnpm teach:verify --print  # also print captured stdout per exercise
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const repoRoot = process.cwd();
const cliEntry = path.join(repoRoot, 'src', 'cli', 'index.ts');
const tsxBin = path.join(repoRoot, 'node_modules', '.bin', 'tsx');
const printMode = process.argv.includes('--print');

/**
 * The artifact-mutating chain, in order. 01 and 03 only write notes/datasets,
 * so they do not affect the artifact the later exercises gate on.
 */
const CHAIN = [
  '02-artifact-first.md',
  '04-row-taxonomy.md',
  '05-suite-taxonomy.md',
  '06-live-agent-evidence.md',
  '07-judge-calibration.md',
  '08-gates-release.md',
  '09-reports-history.md',
  '10-iteration-loop.md',
];

interface Block {
  lang: string;
  body: string;
  startLine: number;
}

/** Extract fenced code blocks with their 1-indexed opening line number. */
function extractBlocks(markdown: string): Block[] {
  const lines = markdown.split('\n');
  const blocks: Block[] = [];
  let open: { lang: string; startLine: number; buf: string[] } | null = null;

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    const fence = line.match(/^```(\w*)\s*$/);
    if (!fence) {
      if (open) open.buf.push(line);
      continue;
    }
    if (open) {
      blocks.push({ lang: open.lang, body: open.buf.join('\n'), startLine: open.startLine });
      open = null;
    } else {
      open = { lang: fence[1] || '', startLine: i + 1, buf: [] };
    }
  }
  return blocks;
}

/**
 * Lines inside a ```text block that are real CLI output worth asserting.
 * Skips elided lines (`...`) and blank lines, which are illustrative only.
 */
function assertableLines(body: string): string[] {
  return body
    .split('\n')
    .map((l) => l.trimEnd())
    .filter((l) => l.length > 0 && !l.includes('...'));
}

function runShellBlock(script: string, cwd: string): { stdout: string; code: number } {
  // Exercises are written for the published CLI; point them at this checkout.
  const rewritten = script
    .replace(/npx eval-dashboards/g, `"${tsxBin}" "${cliEntry}"`)
    .replace(/pnpm cli:dev/g, `"${tsxBin}" "${cliEntry}"`);
  try {
    const stdout = execFileSync('bash', ['-c', rewritten], {
      cwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    return { stdout, code: 0 };
  } catch (error) {
    const err = error as { stdout?: string; stderr?: string; status?: number };
    return { stdout: `${err.stdout ?? ''}${err.stderr ?? ''}`, code: err.status ?? 1 };
  }
}

interface Drift {
  file: string;
  line: number;
  documented: string;
  context: string;
}

function main(): number {
  const workdir = mkdtempSync(path.join(tmpdir(), 'teach-verify-'));
  const drifts: Drift[] = [];
  let assertedCount = 0;

  try {
    for (const filename of CHAIN) {
      const docPath = path.join(repoRoot, 'docs', 'teach-exercises', filename);
      const markdown = readFileSync(docPath, 'utf8');
      const blocks = extractBlocks(markdown);

      // Replay every shell step in this exercise, accumulating its output.
      let captured = '';
      for (const block of blocks) {
        if (block.lang !== 'sh') continue;
        const { stdout } = runShellBlock(block.body, workdir);
        captured += stdout;
      }

      if (printMode) {
        process.stdout.write(`\n=== ${filename} ===\n${captured}`);
      }

      // Every documented output line must appear in what the CLI really printed.
      for (const block of blocks) {
        if (block.lang !== 'text') continue;
        for (const expected of assertableLines(block.body)) {
          assertedCount += 1;
          if (!captured.includes(expected)) {
            drifts.push({
              file: `docs/teach-exercises/${filename}`,
              line: block.startLine,
              documented: expected,
              context: captured.trim().split('\n').slice(-6).join('\n'),
            });
          }
        }
      }
    }
  } finally {
    rmSync(workdir, { recursive: true, force: true });
  }

  if (drifts.length === 0) {
    console.log(
      `Teaching docs verified: ${assertedCount} documented output line(s) across ${CHAIN.length} exercises match real CLI output.`,
    );
    return 0;
  }

  console.error(`Teaching doc drift: ${drifts.length} documented line(s) the CLI never printed.\n`);
  for (const drift of drifts) {
    console.error(`${drift.file}:${drift.line}`);
    console.error(`  documented : ${drift.documented}`);
    console.error(`  real output (tail):`);
    for (const line of drift.context.split('\n')) {
      console.error(`    ${line}`);
    }
    console.error('');
  }
  console.error('Fix the doc to match the CLI, or fix the CLI. Do not edit this check to pass.');
  return 1;
}

process.exit(main());
