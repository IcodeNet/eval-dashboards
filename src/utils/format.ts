export type DateLocale = string; // BCP 47, e.g. 'en-GB', 'en-US', 'de-DE'

const DEFAULT_LOCALE: DateLocale = 'en-GB';

export const formatDate = (iso: string, locale: DateLocale = DEFAULT_LOCALE): string => {
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return iso;
    return new Intl.DateTimeFormat(locale, {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        timeZone: 'UTC',
        timeZoneName: 'short',
    }).format(date);
};

export const formatPassRate = (passed: number, total: number): string => {
    if (total === 0) return '—';
    return `${((passed / total) * 100).toFixed(1)}%`;
};

export const formatDuration = (ms: number): string => {
    if (ms < 1000) return `${Math.round(ms)}ms`;
    if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
    const m = Math.floor(ms / 60_000);
    const s = Math.round((ms % 60_000) / 1000);
    return `${m}m ${s}s`;
};

export const formatCount = (n: number, singular: string, plural = `${singular}s`): string =>
    `${n} ${n === 1 ? singular : plural}`;
