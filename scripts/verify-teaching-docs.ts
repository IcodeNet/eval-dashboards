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
import { cpSync, mkdtempSync, readFileSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const repoRoot = process.cwd();
const cliEntry = path.join(repoRoot, 'src', 'cli', 'index.ts');
const tsxBin = path.join(repoRoot, 'node_modules', '.bin', 'tsx');
const printMode = process.argv.includes('--print');
/**
 * Skip the labs. They regenerate tracked fixtures and write to the repo's
 * .tmp/, which is unsafe to do from inside a concurrent test run.
 */
const exercisesOnly = process.argv.includes('--exercises-only');

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

/**
 * Labs regenerate tracked fixtures in examples/ and write to a repo-relative
 * `.tmp/<name>`, so they must replay in the checkout itself. Consequence: only
 * one teach:verify may run at a time, and the vitest guard passes
 * --exercises-only so the suite never mutates the checkout underneath itself.
 */
const LABS = ['04-release-readiness.md', '05-post-release-monitoring.md'];

/**
 * Self-contained exercises that build their own inputs in a fresh scratch dir
 * instead of inheriting the CHAIN artifact.
 *
 * `needsExamples` links the repo's examples/ into the scratch dir for exercises
 * whose documented commands copy a fixture from a repo-root-relative path.
 *
 * Isolation matters beyond tidiness: exercise 03 runs `init --write`, which
 * scaffolds eval/ and .evals_output/ into the working directory. Run from the
 * repo root it would litter the checkout, so it must never replay there.
 */
const STANDALONE_EXERCISES: { file: string; needsExamples: boolean }[] = [
  { file: '11-diagnose-a-red-run.md', needsExamples: true },
  { file: '03-first-synthetic-dataset.md', needsExamples: false },
];

/**
 * Reading-track exercises for non-engineers. Unlike every other doc, their
 * ```text blocks quote figures rendered into the HTML report rather than CLI
 * stdout, so they are verified against the text of the generated index.html.
 *
 * Their steps also call `open` to launch a browser, which is stripped before
 * replay (see runShellBlock) so CI never spawns a GUI.
 */
const HTML_EXERCISES = ['pm-01-reading-a-report.md', 'pm-02-reading-drift.md'];

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
    .replace(/pnpm cli:dev/g, `"${tsxBin}" "${cliEntry}"`)
    // Reading-track docs tell a human to open the report; never spawn a GUI in CI.
    .replace(/^\s*open\s+.*$/gm, ':');
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

/**
 * Reduce an HTML document to its visible text, so documented figures can be
 * matched against what a reader actually sees on the page.
 *
 * Script and style bodies are dropped first: they contain the report's own data
 * as JSON, which would otherwise satisfy assertions the rendered page does not.
 */
function htmlToText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&');
}

/**
 * Collapse runs of whitespace so a documented figure matches regardless of how
 * the renderer split it across elements: `Passed 8/13` becomes `Passed 8 /13`
 * once tags are stripped, and header strips wrap arbitrarily.
 */
function normalizeForMatch(text: string): string {
  return text.replace(/\s+/g, '');
}

interface Drift {
  file: string;
  line: number;
  documented: string;
  context: string;
}

/**
 * Replay one doc's shell blocks and diff its ```text blocks against reality.
 *
 * `source` selects what "reality" means: 'stdout' asserts against what the CLI
 * printed, 'html' against the visible text of every report the block rendered.
 */
function verifyDoc(
  docRelPath: string,
  cwd: string,
  drifts: Drift[],
  source: 'stdout' | 'html' = 'stdout',
): number {
  const markdown = readFileSync(path.join(repoRoot, docRelPath), 'utf8');
  const blocks = extractBlocks(markdown);
  let asserted = 0;

  let captured = '';
  for (const block of blocks) {
    if (block.lang !== 'sh') continue;
    const { stdout } = runShellBlock(block.body, cwd);
    captured += stdout;
  }

  if (source === 'html') {
    // The CLI prints each report's path; read back what it actually rendered.
    const reports = captured
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l.endsWith('index.html'));
    if (reports.length === 0) {
      drifts.push({
        file: docRelPath,
        line: 1,
        documented: '(expected this doc to render at least one HTML report)',
        context: captured.trim().split('\n').slice(-6).join('\n'),
      });
      return 0;
    }
    captured = reports
      .map((rel) => htmlToText(readFileSync(path.join(cwd, rel), 'utf8')))
      .join('\n');
  }

  if (printMode) {
    process.stdout.write(`\n=== ${docRelPath} ===\n${captured}`);
  }

  const haystack = normalizeForMatch(captured);

  for (const block of blocks) {
    if (block.lang !== 'text') continue;
    for (const expected of assertableLines(block.body)) {
      asserted += 1;
      if (!haystack.includes(normalizeForMatch(expected))) {
        drifts.push({
          file: docRelPath,
          line: block.startLine,
          documented: expected,
          context: captured.trim().split('\n').slice(-6).join('\n'),
        });
      }
    }
  }
  return asserted;
}

function main(): number {
  const workdir = mkdtempSync(path.join(tmpdir(), 'teach-verify-'));
  const drifts: Drift[] = [];
  let assertedCount = 0;

  try {
    // Exercises share one artifact, so they must replay in order in one dir.
    for (const filename of CHAIN) {
      assertedCount += verifyDoc(`docs/teach-exercises/${filename}`, workdir, drifts);
    }
    // Labs regenerate tracked fixtures in examples/ and write to a repo-relative
    // .tmp/<name>, so they must replay in the checkout itself. Consequence: only
    // one teach:verify may run at a time. Do not run it concurrently with itself.
    for (const filename of LABS) {
      if (exercisesOnly) break;
      assertedCount += verifyDoc(`docs/teach-labs/${filename}`, repoRoot, drifts);
    }
    // Standalone exercises bring their own inputs; isolate each in a scratch dir
    // so scaffolding commands like `init --write` never touch the checkout.
    for (const { file, needsExamples } of STANDALONE_EXERCISES) {
      const soloDir = mkdtempSync(path.join(tmpdir(), 'teach-solo-'));
      try {
        if (needsExamples) {
          symlinkSync(path.join(repoRoot, 'examples'), path.join(soloDir, 'examples'));
        }
        assertedCount += verifyDoc(`docs/teach-exercises/${file}`, soloDir, drifts);
      } finally {
        rmSync(soloDir, { recursive: true, force: true });
      }
    }
    // Reading-track exercises assert against rendered HTML, not stdout. They
    // copy examples/ in so the docs' relative fixture paths resolve unmodified.
    for (const file of HTML_EXERCISES) {
      const htmlDir = mkdtempSync(path.join(tmpdir(), 'teach-html-'));
      try {
        cpSync(path.join(repoRoot, 'examples'), path.join(htmlDir, 'examples'), {
          recursive: true,
        });
        assertedCount += verifyDoc(`docs/teach-exercises/${file}`, htmlDir, drifts, 'html');
      } finally {
        rmSync(htmlDir, { recursive: true, force: true });
      }
    }
  } finally {
    rmSync(workdir, { recursive: true, force: true });
  }

  if (drifts.length === 0) {
    const labCount = exercisesOnly ? 0 : LABS.length;
    const exerciseCount =
      CHAIN.length + STANDALONE_EXERCISES.length + HTML_EXERCISES.length;
    console.log(
      `Teaching docs verified: ${assertedCount} documented output line(s) across ` +
        `${exerciseCount} exercises and ${labCount} labs ` +
        `match real CLI output.`,
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
