import { describe, expect, it } from 'vitest';
import {
  completionUsage,
  renderCompletionScript,
  resolveCompletionShell,
} from '../src/cli/completion.js';

describe('completion command', () => {
  it('renders bash/zsh completion with expected commands and flags', () => {
    const script = renderCompletionScript('bash');

    expect(script).toContain('# eval-dashboards shell completion (bash)');
    expect(script).toContain('complete -F _eval_dashboards_completions eval-dashboards');
    expect(script).toContain('complete -F _eval_dashboards_completions evd');
    expect(script).toContain('report report-index lint check merge history publish teach init completion import');
    expect(script).toContain('install --help --shell');
    expect(script).toContain('--setup');
    expect(script).toContain('--runner');
    expect(script).toContain('--ci');
    expect(script).toContain('--playbook');
    expect(script).toContain('--profile');
    expect(script).toContain('--from');
    expect(script).toContain('promptfoo deepeval agentevals openevals');
    expect(script).toContain('default guardrail');
    expect(script).toContain('--shell');
  });

  it('renders fish completion with expected command entries', () => {
    const script = renderCompletionScript('fish');

    expect(script).toContain('complete -c eval-dashboards -n "__fish_use_subcommand" -a "init"');
    expect(script).toContain('complete -c eval-dashboards -n "__fish_use_subcommand" -a "teach"');
    expect(script).toContain('complete -c evd -n "__fish_use_subcommand" -a "init"');
    expect(script).toContain('complete -c eval-dashboards -n "__fish_use_subcommand" -a "completion"');
    expect(script).toContain('complete -c eval-dashboards -n "__fish_use_subcommand" -a "import"');
    expect(script).toContain('complete -c eval-dashboards -n "__fish_use_subcommand" -a "report"');
    expect(script).toContain('complete -c eval-dashboards -n "__fish_seen_subcommand_from report" -l profile');
    expect(script).toContain('complete -c evd -n "__fish_seen_subcommand_from completion" -a "install"');
    expect(script).toContain('__fish_prev_arg_in --profile" -a "default guardrail"');
    expect(script).toContain('evals judges multiturn');
  });

  it('renders zsh completion with install action', () => {
    const script = renderCompletionScript('zsh');

    expect(script).toContain('# eval-dashboards shell completion (zsh)');
    expect(script).toContain('compdef _eval_dashboards_completions evd');
    expect(script).toContain('completion actions" install --help --shell');
  });

  it('infers shell and validates explicit shell values', () => {
    expect(resolveCompletionShell('bash')).toBe('bash');
    expect(resolveCompletionShell('zsh')).toBe('zsh');
    expect(resolveCompletionShell('fish')).toBe('fish');
    expect(() => resolveCompletionShell('powershell')).toThrow('Unknown completion shell powershell');
  });

  it('documents completion usage examples', () => {
    expect(completionUsage).toContain('eval-dashboards completion install');
    expect(completionUsage).toContain('eval-dashboards completion --shell=bash');
    expect(completionUsage).toContain('eval-dashboards completion --shell=zsh');
    expect(completionUsage).toContain('eval-dashboards completion --shell=fish');
  });
});
