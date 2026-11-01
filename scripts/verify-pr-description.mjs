import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Keep offsets intact so headings inside examples cannot impersonate sections.
const maskFences = (text) => {
  let fence;
  return text.split('\n').map(line => {
    const marker = line.match(/^ {0,3}(`{3,}|~{3,})(.*)$/);
    if (!fence && marker) {
      fence = { char: marker[1][0], length: marker[1].length };
      return ' '.repeat(line.length);
    }
    if (fence) {
      if (marker && marker[1][0] === fence.char && marker[1].length >= fence.length && !marker[2].trim()) fence = undefined;
      return ' '.repeat(line.length);
    }
    return line;
  }).join('\n');
};
const withoutComments = text => text.replace(/<!--[\s\S]*?-->/g, match => match.replace(/[^\n]/g, ' '));
const headings = text => [...maskFences(text).matchAll(/^##[\t ]+([^\r\n]+?)[\t ]*\r?$/gm)];

export const validatePrDescription = (body, template) => {
  const expected = headings(withoutComments(template)).map(match => match[1]);
  if (!expected.length) throw new Error('The repository PR template has no sections.');
  const clean = withoutComments(typeof body === 'string' ? body : '');
  const actual = headings(clean);
  const errors = [];
  if (JSON.stringify(actual.map(match => match[1])) !== JSON.stringify(expected)) {
    errors.push('Use every repository PR-template heading exactly once, in the same order, with no extra level-two headings.');
  }
  for (let i = 0; i < actual.length; i += 1) {
    if (!expected.includes(actual[i][1])) continue;
    const content = clean.slice(actual[i].index + actual[i][0].length, actual[i + 1]?.index ?? clean.length)
      .replace(/^\s*[-*]\s*(?:Before|After):?\s*$/gim, '').trim();
    if (!content || /^(?:todo|tbd|n\/?a)[.!]?$/i.test(content)) errors.push(`Add concrete content under “${actual[i][1]}”; explain why if it does not apply.`);
  }
  return errors;
};

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const eventPath = process.argv[2] ?? process.env.GITHUB_EVENT_PATH;
    if (!eventPath) throw new Error('Provide a GitHub event JSON file or GITHUB_EVENT_PATH.');
    const event = JSON.parse(readFileSync(eventPath, 'utf8'));
    if (!event.pull_request) throw new Error('The event must contain a pull_request.');
    const template = readFileSync(new URL('../.github/pull_request_template.md', import.meta.url), 'utf8');
    const errors = validatePrDescription(event.pull_request.body, template);
    if (errors.length) {
      for (const error of errors) console.error(error);
      process.exitCode = 1;
    } else console.log('PR description follows the repository template. Wording and evidence still require human review.');
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
