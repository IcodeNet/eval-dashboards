export type CliArgs = {
  command?: string;
  options: Record<string, string | boolean | string[]>;
};

export const parseArgs = (argv: string[]): CliArgs => {
  const [command, ...rest] = argv;
  const options: Record<string, string | boolean | string[]> = {};

  for (let index = 0; index < rest.length; index += 1) {
    const token = rest[index];

    if (!token?.startsWith('--')) {
      continue;
    }

    const [rawKey, inlineValue] = token.slice(2).split('=', 2);
    const next = rest[index + 1];
    const value = inlineValue ?? (next && !next.startsWith('--') ? next : true);

    if (value === next) {
      index += 1;
    }

    const existing = options[rawKey];

    if (existing === undefined) {
      options[rawKey] = value;
    } else if (Array.isArray(existing)) {
      existing.push(String(value));
    } else {
      options[rawKey] = [String(existing), String(value)];
    }
  }

  return { command, options };
};

export const optionString = (
  options: Record<string, string | boolean | string[]>,
  name: string,
  fallback: string,
): string => {
  const value = options[name];

  if (typeof value === 'string') {
    return value;
  }

  if (Array.isArray(value) && value.length > 0) {
    return value[0] ?? fallback;
  }

  return fallback;
};

export const optionStrings = (
  options: Record<string, string | boolean | string[]>,
  name: string,
  fallback: string[],
): string[] => {
  const value = options[name];

  if (typeof value === 'string') {
    return [value];
  }

  if (Array.isArray(value)) {
    return value;
  }

  return fallback;
};

export const optionNumber = (
  options: Record<string, string | boolean | string[]>,
  name: string,
): number | undefined => {
  const value = options[name];

  if (typeof value !== 'string') {
    return undefined;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
};

export const optionBoolean = (
  options: Record<string, string | boolean | string[]>,
  name: string,
): boolean => options[name] === true || options[name] === 'true';