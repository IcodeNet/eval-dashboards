import type { ReporterName } from '../reporters/render.js';
import type { GateConfig } from '../gates/check-gates.js';
import type { EvalReportsTheme } from '../reporters/themes.js';

export type EvalReportsConfig = {
  /** Glob patterns or directory for artifact discovery. Default: ['.evals_output/**\/*.json'] */
  input?: string | string[];
  /** Directory where reports are written. Default: 'eval-report' */
  reportDir?: string;
  /** Reporters to run. Default: ['html', 'text'] */
  reporters?: ReporterName[];
  /** Gate configuration applied by eval-reports check. */
  gates?: GateConfig;
  /** Built-in theme name ('default' | 'dark' | 'minimal') or a custom theme object. */
  theme?: string | Partial<EvalReportsTheme>;
  /** BCP 47 locale for date/number formatting. Default: 'en-GB' */
  locale?: string;
};
