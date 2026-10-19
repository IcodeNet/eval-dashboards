import { suggestClosest } from '../utils/suggest.js';
export type ThemeVariables = Record<string, string>;

export type EvalReportsTheme = {
  name: string;
  colorScheme: 'light' | 'dark';
  variables: ThemeVariables;
};

const defaultTheme: EvalReportsTheme = {
  name: 'default',
  colorScheme: 'light',
  variables: {
    '--bg': '#f8fafc',
    '--surface': '#ffffff',
    '--surface-muted': '#f1f5f9',
    '--surface-raised': '#ffffff',
    '--ink': '#0f172a',
    '--muted': '#526074',
    '--line': '#e2e8f0',
    '--shadow': '0 1px 3px rgba(0,0,0,.08)',
    '--pass': '#166534',
    '--pass-soft': 'rgba(22,163,74,.12)',
    '--fail': '#b91c1c',
    '--fail-soft': 'rgba(220,38,38,.12)',
    '--warn': '#92400e',
    '--warn-soft': 'rgba(217,119,6,.12)',
    '--accent': '#1d4ed8',
    '--accent-soft': 'rgba(37,99,235,.12)',
    '--on-accent': '#ffffff',
    '--banner-bg': '#0f172a',
    '--banner-ink': '#f8fafc',
    '--banner-muted': 'rgba(248,250,252,.6)',
    '--font': "ui-sans-serif, system-ui, -apple-system, 'Segoe UI', sans-serif",
    '--font-mono': "ui-monospace, 'Cascadia Code', 'JetBrains Mono', monospace",
    '--radius': '8px',
  },
};

const darkTheme: EvalReportsTheme = {
  name: 'dark',
  colorScheme: 'dark',
  variables: {
    '--bg': '#0b0f17',
    '--surface': '#131a24',
    '--surface-muted': '#0f1620',
    '--surface-raised': '#1a2331',
    '--ink': '#e6edf3',
    '--muted': '#9aa7b8',
    '--line': '#1e2d3d',
    '--shadow': '0 1px 6px rgba(0,0,0,.4)',
    '--pass': '#4ade80',
    '--pass-soft': 'rgba(74,222,128,.14)',
    '--fail': '#f87171',
    '--fail-soft': 'rgba(248,113,113,.14)',
    '--warn': '#fbbf24',
    '--warn-soft': 'rgba(251,191,36,.14)',
    '--accent': '#7dd3fc',
    '--accent-soft': 'rgba(125,211,252,.14)',
    '--on-accent': '#0b0f17',
    '--banner-bg': '#060a10',
    '--banner-ink': '#e6edf3',
    '--banner-muted': 'rgba(230,237,243,.55)',
    '--font': "ui-sans-serif, system-ui, -apple-system, 'Segoe UI', sans-serif",
    '--font-mono': "ui-monospace, 'Cascadia Code', 'JetBrains Mono', monospace",
    '--radius': '8px',
  },
};

const minimalTheme: EvalReportsTheme = {
  name: 'minimal',
  colorScheme: 'light',
  variables: {
    '--bg': '#ffffff',
    '--surface': '#fafafa',
    '--surface-muted': '#f5f5f5',
    '--surface-raised': '#ffffff',
    '--ink': '#111111',
    '--muted': '#595959',
    '--line': '#dddddd',
    '--shadow': 'none',
    '--pass': '#1b5e20',
    '--pass-soft': 'rgba(46,125,50,.10)',
    '--fail': '#c62828',
    '--fail-soft': 'rgba(198,40,40,.10)',
    '--warn': '#bf360c',
    '--warn-soft': 'rgba(230,81,0,.10)',
    '--accent': '#1565c0',
    '--accent-soft': 'rgba(21,101,192,.10)',
    '--on-accent': '#ffffff',
    '--banner-bg': '#111111',
    '--banner-ink': '#ffffff',
    '--banner-muted': 'rgba(255,255,255,.65)',
    '--font': "Georgia, 'Times New Roman', serif",
    '--font-mono': "ui-monospace, monospace",
    '--radius': '2px',
  },
};

export const BUILT_IN_THEMES: Record<string, EvalReportsTheme> = {
  default: defaultTheme,
  dark: darkTheme,
  minimal: minimalTheme,
};

/** Error text for a theme name that is not built in, with the closest name when one is near. */
export const describeUnknownTheme = (name: string): string => {
  const names = Object.keys(BUILT_IN_THEMES);
  const closest = suggestClosest(name, names);
  return closest
    ? `Unknown theme "${name}". Did you mean "${closest}"? Use one of: ${names.join(', ')}.`
    : `Unknown theme "${name}". Use one of: ${names.join(', ')}.`;
};

/**
 * Resolve a theme option (a built-in theme name, a partial theme override
 * object, or undefined) into a complete `EvalReportsTheme` used by the HTML
 * reporter. Unknown theme names and partial overrides fall back to the
 * default theme's values for any unset fields.
 */
export const resolveTheme = (
  theme: string | Partial<EvalReportsTheme> | undefined,
): EvalReportsTheme => {
  if (!theme) return defaultTheme;
  if (typeof theme === 'string') return BUILT_IN_THEMES[theme] ?? defaultTheme;
  const base = BUILT_IN_THEMES[theme.name ?? 'default'] ?? defaultTheme;
  return { ...base, ...theme, variables: { ...base.variables, ...theme.variables } };
};

export const renderCssVariables = (theme: EvalReportsTheme): string =>
  Object.entries(theme.variables)
    .map(([k, v]) => `  ${k}: ${v};`)
    .join('\n');
