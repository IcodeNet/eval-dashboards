import { readFileSync } from 'node:fs';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
// @ts-expect-error plain .mjs module without declarations
import { validatePrDescription } from '../scripts/verify-pr-description.mjs';
const template = readFileSync('.github/pull_request_template.md', 'utf8');
const titles = [...template.matchAll(/^## (.+)$/gm)].map(match => match[1]);
const valid = titles.map(title => `## ${title}\n\nConcrete example, result, or reason.\n`).join('\n');

describe('PR description structure', () => {
  it('accepts the versioned headings with content, nested headings, code, and automation controls', () => {
    expect(validatePrDescription(`${valid}\n### Extra detail\nUseful detail.\n<!-- rebase-check -->\n- [ ] Retry`, template)).toEqual([]);
  });
  it('rejects the untouched template even though its guidance comments are populated', () => {
    expect(validatePrDescription(template, template).length).toBeGreaterThan(0);
  });
  it('rejects missing, repeated, reordered, and extra headings', () => {
    for (const body of [valid.replace(`## ${titles[0]}`, '### Removed'), `${valid}\n## Extra\nText`, `${valid}\n## ${titles[0]}\nRepeated`, valid.replace(titles[0], 'replacement').replace(titles[1], titles[0]).replace('replacement', titles[1])]) {
      expect(validatePrDescription(body, template).length).toBeGreaterThan(0);
    }
  });
  it('does not count headings hidden in comments or fenced examples', () => {
    expect(validatePrDescription(`<!--\n${valid}\n-->`, template).length).toBeGreaterThan(0);
    expect(validatePrDescription(`\`\`\`markdown\n${valid}\n\`\`\``, template).length).toBeGreaterThan(0);
    expect(validatePrDescription(`${valid}\n~~~markdown\n## Example inside a fence\n~~~`, template)).toEqual([]);
  });
  it('rejects empty, null, and placeholder-only bodies while allowing explained non-applicability', () => {
    for (const body of [null, '', titles.map(title => `## ${title}\n\nTODO\n`).join('\n')]) expect(validatePrDescription(body, template).length).toBeGreaterThan(0);
    expect(validatePrDescription(valid.replace('Concrete example, result, or reason.', 'Not applicable: this change adds documentation only.'), template)).toEqual([]);
  });
  it('reads body data from JSON without executing shell text', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'pr-description-'));
    try {
      const eventPath = path.join(dir, 'event.json');
      writeFileSync(eventPath, JSON.stringify({ pull_request: { body: `${valid}\n$(exit 99)\n\`exit 99\`` } }));
      expect(execFileSync(process.execPath, ['scripts/verify-pr-description.mjs', eventPath], { encoding: 'utf8' })).toContain('follows the repository template');
      writeFileSync(eventPath, JSON.stringify({ pull_request: { body: 'Old free-form description' } }));
      expect(spawnSync(process.execPath, ['scripts/verify-pr-description.mjs', eventPath]).status).toBe(1);
      writeFileSync(eventPath, JSON.stringify({}));
      expect(spawnSync(process.execPath, ['scripts/verify-pr-description.mjs', eventPath]).status).toBe(1);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
  it('keeps Renovate headings aligned and retains warning and rebase controls', () => {
    const config = JSON.parse(readFileSync('renovate.json', 'utf8'));
    expect(validatePrDescription(config.prBodyTemplate.replace(/\{\{\{\w+\}\}\}/g, 'Generated dependency detail.'), template)).toEqual([]);
    for (const field of ['table', 'warnings', 'notes', 'controls', 'footer']) expect(config.prBodyTemplate).toContain(`{{{${field}}}}`);
    expect(readFileSync('.coderabbit.yaml', 'utf8')).toContain('high_level_summary_in_walkthrough: true');
  });
});
