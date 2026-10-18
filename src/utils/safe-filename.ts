/**
 * Turns an untrusted identifier (such as a run id read from an artifact) into one safe
 * file-name segment, so it can never add path separators or `..` to an output path.
 */
export const toSafeFileSegment = (value: string): string => {
  const cleaned = value.replace(/[^A-Za-z0-9._-]/g, '_').replace(/^\.+/, '_');
  return cleaned === '' ? '_' : cleaned.slice(0, 120);
};
