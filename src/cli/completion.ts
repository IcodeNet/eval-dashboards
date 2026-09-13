import os from 'node:os';
import path from 'node:path';
import { mkdir, readFile, writeFile } from 'node:fs/promises';

export type CompletionShell = 'bash' | 'zsh' | 'fish';

const cliNames = ['eval-dashboards', 'evd'] as const;

const commands = [
  'report',
  'report-index',
  'lint',
  'check',
  'merge',
  'history',
  'publish',
  'teach',
  'init',
  'completion',
  'import',
  'adjudicate',
] as const;

const rootFlags = ['--help'] as const;
const initFlags = [
  '--help',
  '--preset',
  '--setup',
  '--runner',
  '--ci',
  '--write',
  '--dry-run',
  '--teach',
  '--out-dir',
  '--force',
  '--playbook',
] as const;

const publishFlags = [
  '--target',
  '--report-dir',
  '--input',
  '--out-dir',
  '--dry-run',
  '--repo',
  '--branch',
  '--token',
  '--app-name',
  '--account',
  '--container',
] as const;

const checkFlags = [
  '--input',
  '--report-dir',
  '--min-pass-rate',
  '--max-new-failures',
  '--zero-critical',
  '--max-warnings',
  '--max-warning-code',
  '--fail-on-warning-code',
  '--new-failure-key',
  '--require-suite-pass',
  '--baseline-run-id',
  '--baseline-strategy',
  '--baseline-lookback',
  '--allow-blocked-baseline',
  '--statistical-mode',
  '--confidence-level',
  '--bootstrap-samples',
  '--min-pass-rate-delta',
  '--min-matched-expectation-rate',
  '--json-out',
  '--junit-out',
  '--sarif-out',
  '--github-annotations-out',
  '--heartbeat-out',
] as const;

const reportFlags = [
  '--input',
  '--report-dir',
  '--reporter',
  '--theme',
  '--locale',
  '--run-id',
  '--baseline-run-id',
  '--baseline-strategy',
  '--baseline-lookback',
  '--profile',
  '--statistical-mode',
  '--confidence-level',
  '--bootstrap-samples',
  '--min-pass-rate-delta',
] as const;

const importFlags = ['--from', '--input', '--out', '--suite', '--help'] as const;

const adjudicateFlags = [
  '--help',
  '--input',
  '--run-id',
  '--out',
  '--bundle',
  '--include-passed',
] as const;

const optionValues = {
  preset: ['agent-quality'],
  setup: ['guardrails', 'evals', 'judges', 'multiturn'],
  runner: ['vitest', 'jest', 'node', 'python'],
  ci: ['github', 'azure', 'none'],
  shell: ['bash', 'zsh', 'fish'],
  importSource: ['promptfoo', 'deepeval', 'agentevals', 'openevals'],
  reportProfile: ['default', 'guardrail'],
  statisticalMode: ['off', 'bootstrap'],
} as const;

const detectShell = (shellHint?: string): CompletionShell => {
  const source = shellHint ?? process.env.SHELL ?? '';
  if (source.includes('zsh')) return 'zsh';
  if (source.includes('fish')) return 'fish';
  return 'bash';
};

export const resolveCompletionShell = (shellHint?: string): CompletionShell => {
  if (!shellHint) return detectShell();

  const normalized = shellHint.trim().toLowerCase();
  if (normalized === 'bash' || normalized === 'zsh' || normalized === 'fish') {
    return normalized;
  }

  throw Object.assign(new Error(`Unknown completion shell ${shellHint}. Allowed values: bash, zsh, fish.`), {
    exitCode: 2,
  });
};

const renderBash = (): string => {
  const commandWordList = commands.join(' ');
  const rootFlagList = rootFlags.join(' ');
  const initFlagList = initFlags.join(' ');
  const publishFlagList = publishFlags.join(' ');
  const checkFlagList = checkFlags.join(' ');
  const reportFlagList = reportFlags.join(' ');
  const importFlagList = importFlags.join(' ');
  const adjudicateFlagList = adjudicateFlags.join(' ');

  return [
    '# eval-dashboards shell completion (bash)',
    '_eval_dashboards_completions() {',
    '  local cur prev words cword',
    '  if declare -F _init_completion >/dev/null 2>&1; then',
    '    _init_completion -n : || return',
    '  else',
    '    cur="${COMP_WORDS[COMP_CWORD]}"',
    '    prev="${COMP_WORDS[COMP_CWORD-1]}"',
    '  fi',
    '',
    '  case "${prev}" in',
    `    --preset) COMPREPLY=( $(compgen -W "${optionValues.preset.join(' ')}" -- "\${cur}") ); return ;;`,
    `    --setup) COMPREPLY=( $(compgen -W "${optionValues.setup.join(' ')}" -- "\${cur}") ); return ;;`,
    `    --runner) COMPREPLY=( $(compgen -W "${optionValues.runner.join(' ')}" -- "\${cur}") ); return ;;`,
    `    --ci) COMPREPLY=( $(compgen -W "${optionValues.ci.join(' ')}" -- "\${cur}") ); return ;;`,
    `    --shell) COMPREPLY=( $(compgen -W "${optionValues.shell.join(' ')}" -- "\${cur}") ); return ;;`,
    `    --from) COMPREPLY=( $(compgen -W "${optionValues.importSource.join(' ')}" -- "\${cur}") ); return ;;`,
    `    --profile) COMPREPLY=( $(compgen -W "${optionValues.reportProfile.join(' ')}" -- "\${cur}") ); return ;;`,
    `    --statistical-mode) COMPREPLY=( $(compgen -W "${optionValues.statisticalMode.join(' ')}" -- "\${cur}") ); return ;;`,
    '  esac',
    '',
    '  if [[ ${COMP_CWORD} -eq 1 ]]; then',
    `    COMPREPLY=( $(compgen -W "${commandWordList} ${rootFlagList}" -- "\${cur}") )`,
    '    return',
    '  fi',
    '',
    '  case "${COMP_WORDS[1]}" in',
    `    init|teach) COMPREPLY=( $(compgen -W "${initFlagList}" -- "\${cur}") ) ;;
    report) COMPREPLY=( $(compgen -W "${reportFlagList}" -- "\${cur}") ) ;;
    publish) COMPREPLY=( $(compgen -W "${publishFlagList}" -- "\${cur}") ) ;;
    check) COMPREPLY=( $(compgen -W "${checkFlagList}" -- "\${cur}") ) ;;
    completion) COMPREPLY=( $(compgen -W "install --help --shell" -- "\${cur}") ) ;;
    import) COMPREPLY=( $(compgen -W "${importFlagList}" -- "\${cur}") ) ;;
    adjudicate) COMPREPLY=( $(compgen -W "export import ${adjudicateFlagList}" -- "\${cur}") ) ;;
    *) COMPREPLY=( $(compgen -W "--help" -- "\${cur}") ) ;;
  esac`,
    '}',
    '',
    ...cliNames.map((name) => `complete -F _eval_dashboards_completions ${name}`),
  ].join('\n');
};

const renderZsh = (): string => {
  const commandWordList = commands.join(' ');
  const rootFlagList = rootFlags.join(' ');
  const initFlagList = initFlags.join(' ');
  const publishFlagList = publishFlags.join(' ');
  const checkFlagList = checkFlags.join(' ');
  const reportFlagList = reportFlags.join(' ');
  const importFlagList = importFlags.join(' ');
  const adjudicateFlagList = adjudicateFlags.join(' ');

  return [
    '#compdef eval-dashboards evd',
    '# eval-dashboards shell completion (zsh)',
    '_eval_dashboards_completions() {',
    '  local curcontext="$curcontext" state line',
    '  typeset -A opt_args',
    '',
    '  if (( CURRENT == 2 )); then',
    `    _values "command" ${commandWordList} ${rootFlagList}`,
    '    return',
  '  fi',

    '  if [[ "$words[2]" == "completion" && $CURRENT -eq 3 ]]; then',
    '    _values "completion actions" install --help --shell',
    '    return',
    '  fi',
    '',
    '  case "$words[2]" in',
    `    init|teach) _values "init flags" ${initFlagList} ;;
    report) _values "report flags" ${reportFlagList} ;;
    publish) _values "publish flags" ${publishFlagList} ;;
    check) _values "check flags" ${checkFlagList} ;;
    completion) _values "completion options" install --help --shell ;;
    import) _values "import flags" ${importFlagList} ;;
    adjudicate) _values "adjudicate action/flags" export import ${adjudicateFlagList} ;;
    *) _values "root flags" ${rootFlagList} ;;
  esac`,
    '',
    '  case "$words[CURRENT-1]" in',
    `    --preset) _values "preset" ${optionValues.preset.join(' ')} ;;
    --setup) _values "setup" ${optionValues.setup.join(' ')} ;;
    --runner) _values "runner" ${optionValues.runner.join(' ')} ;;
    --ci) _values "ci" ${optionValues.ci.join(' ')} ;;
    --shell) _values "shell" ${optionValues.shell.join(' ')} ;;
    --from) _values "import source" ${optionValues.importSource.join(' ')} ;;
    --profile) _values "report profile" ${optionValues.reportProfile.join(' ')} ;;
    --statistical-mode) _values "statistical mode" ${optionValues.statisticalMode.join(' ')} ;;
  esac`,
    '}',
    '',
    ...cliNames.map((name) => `compdef _eval_dashboards_completions ${name}`),
  ].join('\n');
};

const renderFish = (): string => {
  const lines = ['# eval-dashboards shell completion (fish)'];

  for (const cliName of cliNames) {
    lines.push(`complete -c ${cliName} -f`);
    lines.push(
      ...commands.map(
        (command) => `complete -c ${cliName} -n "__fish_use_subcommand" -a "${command}"`,
      ),
    );
    lines.push(
      `complete -c ${cliName} -n "__fish_seen_subcommand_from completion" -a "install"`,
    );
    lines.push(
      ...initFlags.map(
        (flag) =>
          `complete -c ${cliName} -n "__fish_seen_subcommand_from init" -l ${flag.replace('--', '')}`,
      ),
      ...initFlags.map(
        (flag) =>
          `complete -c ${cliName} -n "__fish_seen_subcommand_from teach" -l ${flag.replace('--', '')}`,
      ),
    );
    lines.push(
      ...publishFlags.map(
        (flag) =>
          `complete -c ${cliName} -n "__fish_seen_subcommand_from publish" -l ${flag.replace('--', '')}`,
      ),
    );
    lines.push(
      ...reportFlags.map(
        (flag) =>
          `complete -c ${cliName} -n "__fish_seen_subcommand_from report" -l ${flag.replace('--', '')}`,
      ),
    );
    lines.push(
      ...checkFlags.map(
        (flag) =>
          `complete -c ${cliName} -n "__fish_seen_subcommand_from check" -l ${flag.replace('--', '')}`,
      ),
    );
    lines.push(
      ...importFlags.map(
        (flag) =>
          `complete -c ${cliName} -n "__fish_seen_subcommand_from import" -l ${flag.replace('--', '')}`,
      ),
    );
    lines.push(
      ...adjudicateFlags.map(
        (flag) =>
          `complete -c ${cliName} -n "__fish_seen_subcommand_from adjudicate" -l ${flag.replace('--', '')}`,
      ),
    );
    lines.push(`complete -c ${cliName} -n "__fish_seen_subcommand_from adjudicate" -a "export import"`);
    lines.push(
      `complete -c ${cliName} -n "__fish_seen_subcommand_from init; and __fish_prev_arg_in --preset" -a "${optionValues.preset.join(' ')}"`,
      `complete -c ${cliName} -n "__fish_seen_subcommand_from init; and __fish_prev_arg_in --setup" -a "${optionValues.setup.join(' ')}"`,
      `complete -c ${cliName} -n "__fish_seen_subcommand_from init; and __fish_prev_arg_in --runner" -a "${optionValues.runner.join(' ')}"`,
      `complete -c ${cliName} -n "__fish_seen_subcommand_from init; and __fish_prev_arg_in --ci" -a "${optionValues.ci.join(' ')}"`,
      `complete -c ${cliName} -n "__fish_seen_subcommand_from teach; and __fish_prev_arg_in --preset" -a "${optionValues.preset.join(' ')}"`,
      `complete -c ${cliName} -n "__fish_seen_subcommand_from teach; and __fish_prev_arg_in --setup" -a "${optionValues.setup.join(' ')}"`,
      `complete -c ${cliName} -n "__fish_seen_subcommand_from teach; and __fish_prev_arg_in --runner" -a "${optionValues.runner.join(' ')}"`,
      `complete -c ${cliName} -n "__fish_seen_subcommand_from teach; and __fish_prev_arg_in --ci" -a "${optionValues.ci.join(' ')}"`,
      `complete -c ${cliName} -n "__fish_seen_subcommand_from completion; and __fish_prev_arg_in --shell" -a "${optionValues.shell.join(' ')}"`,
      `complete -c ${cliName} -n "__fish_seen_subcommand_from import; and __fish_prev_arg_in --from" -a "${optionValues.importSource.join(' ')}"`,
      `complete -c ${cliName} -n "__fish_seen_subcommand_from report; and __fish_prev_arg_in --profile" -a "${optionValues.reportProfile.join(' ')}"`,
      `complete -c ${cliName} -n "__fish_seen_subcommand_from report check; and __fish_prev_arg_in --statistical-mode" -a "${optionValues.statisticalMode.join(' ')}"`,
    );
  }

  return lines.join('\n');
};

export const completionUsage = `eval-dashboards completion [install] [options]

Options:
  --shell=<name>   Shell to render completion for: bash|zsh|fish.
                   Default: inferred from $SHELL, falling back to bash.

Examples:
  eval-dashboards completion install

  eval-dashboards completion --shell=bash > ~/.eval-dashboards-completion.bash
  source ~/.eval-dashboards-completion.bash

  mkdir -p ~/.zsh/completions
  eval-dashboards completion --shell=zsh > ~/.zsh/completions/_evd
  fpath=(~/.zsh/completions $fpath)
  autoload -Uz compinit && compinit

  eval-dashboards completion --shell=fish > ~/.config/fish/completions/eval-dashboards.fish
`;

export const renderCompletionScript = (shell: CompletionShell): string => {
  if (shell === 'zsh') return renderZsh();
  if (shell === 'fish') return renderFish();
  return renderBash();
};

export type CompletionInstallResult = {
  shell: CompletionShell;
  completionFile: string;
  profileFile?: string;
  updatedProfile: boolean;
};

const readFileIfExists = async (filePath: string): Promise<string> => {
  try {
    return await readFile(filePath, 'utf8');
  } catch {
    return '';
  }
};

const ensureProfileLines = async (profileFile: string, lines: string[]): Promise<boolean> => {
  const current = await readFileIfExists(profileFile);
  const missing = lines.filter((line) => !current.includes(line));

  if (missing.length === 0) {
    return false;
  }

  const prefix = current.endsWith('\n') || current.length === 0 ? '' : '\n';
  const addition = `${prefix}${missing.join('\n')}\n`;
  await writeFile(profileFile, `${current}${addition}`, 'utf8');
  return true;
};

const shellProfileFile = (shell: CompletionShell): string | undefined => {
  const home = os.homedir();
  if (shell === 'zsh') return path.join(home, '.zshrc');
  if (shell === 'bash') return path.join(home, '.bashrc');
  return undefined;
};

const completionFilePath = (shell: CompletionShell): string => {
  const home = os.homedir();
  if (shell === 'zsh') return path.join(home, '.zsh', 'completions', '_evd');
  if (shell === 'fish') return path.join(home, '.config', 'fish', 'completions', 'eval-dashboards.fish');
  return path.join(home, '.eval-dashboards-completion.bash');
};

export const installCompletion = async (shell: CompletionShell): Promise<CompletionInstallResult> => {
  const completionFile = completionFilePath(shell);
  await mkdir(path.dirname(completionFile), { recursive: true });
  await writeFile(completionFile, `${renderCompletionScript(shell)}\n`, 'utf8');

  const profileFile = shellProfileFile(shell);
  let updatedProfile = false;

  if (shell === 'zsh' && profileFile) {
    updatedProfile = await ensureProfileLines(profileFile, [
      'fpath=(~/.zsh/completions $fpath)',
      'autoload -Uz compinit && compinit',
    ]);
  }

  if (shell === 'bash' && profileFile) {
    updatedProfile = await ensureProfileLines(profileFile, [
      '[ -f ~/.eval-dashboards-completion.bash ] && source ~/.eval-dashboards-completion.bash',
    ]);
  }

  return {
    shell,
    completionFile,
    profileFile,
    updatedProfile,
  };
};
