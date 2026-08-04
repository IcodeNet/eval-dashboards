import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

type ManualSignals = {
  externalRunnerAdoptions: number;
  schemaCitationsVerified: number;
  partnershipOutreachStarted: boolean;
  partnershipPilotsActive: number;
  notes: string;
};

type AdoptionSnapshot = {
  generatedAt: string;
  repository: string;
  npm: {
    packageName: string;
    weeklyDownloads: number | null;
  };
  github: {
    stars: number | null;
    forks: number | null;
    openIssues: number | null;
    schemaCitationSearchCount: number | null;
  };
  manualSignals: ManualSignals;
  targets: {
    externalRunnersDiscovered: number;
    externalRunnerAdoptions: number;
    schemaCitationsVerified: number;
    weeklyDownloads: number;
  };
};

const PACKAGE_NAME = '@icodenet/eval-dashboards';
const REPOSITORY = 'IcodeNet/eval-dashboards';
const OUTPUT_DIR = path.join('docs', 'adoption-metrics');
const MANUAL_SIGNALS_PATH = path.join(OUTPUT_DIR, 'manual-signals.json');
const SNAPSHOT_PATH = path.join(OUTPUT_DIR, 'latest.json');

const defaultManualSignals: ManualSignals = {
  externalRunnerAdoptions: 0,
  schemaCitationsVerified: 0,
  partnershipOutreachStarted: false,
  partnershipPilotsActive: 0,
  notes: '',
};

const githubHeaders = (): Record<string, string> => {
  const token = process.env.GITHUB_TOKEN;
  const headers: Record<string, string> = {
    Accept: 'application/vnd.github+json',
    'User-Agent': 'eval-dashboards-adoption-metrics',
  };

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  return headers;
};

const safeFetchJson = async <T>(url: string, headers?: Record<string, string>): Promise<T | null> => {
  try {
    const response = await fetch(url, { headers });
    if (!response.ok) return null;
    return (await response.json()) as T;
  } catch {
    return null;
  }
};

const loadManualSignals = async (): Promise<ManualSignals> => {
  try {
    const text = await readFile(MANUAL_SIGNALS_PATH, 'utf8');
    const parsed = JSON.parse(text) as Partial<ManualSignals>;
    return {
      externalRunnerAdoptions: Number(parsed.externalRunnerAdoptions ?? 0),
      schemaCitationsVerified: Number(parsed.schemaCitationsVerified ?? 0),
      partnershipOutreachStarted: Boolean(parsed.partnershipOutreachStarted ?? false),
      partnershipPilotsActive: Number(parsed.partnershipPilotsActive ?? 0),
      notes: String(parsed.notes ?? ''),
    };
  } catch {
    return defaultManualSignals;
  }
};

const writeIfMissingManualSignals = async (): Promise<void> => {
  try {
    await readFile(MANUAL_SIGNALS_PATH, 'utf8');
  } catch {
    await writeFile(MANUAL_SIGNALS_PATH, `${JSON.stringify(defaultManualSignals, null, 2)}\n`, 'utf8');
  }
};

type NpmPointResponse = {
  downloads: number;
};

type GithubRepoResponse = {
  stargazers_count: number;
  forks_count: number;
  open_issues_count: number;
};

type GithubSearchResponse = {
  total_count: number;
};

const collect = async (): Promise<AdoptionSnapshot> => {
  const npmPoint = await safeFetchJson<NpmPointResponse>(
    `https://api.npmjs.org/downloads/point/last-week/${encodeURIComponent(PACKAGE_NAME)}`,
  );

  const repo = await safeFetchJson<GithubRepoResponse>(
    `https://api.github.com/repos/${REPOSITORY}`,
    githubHeaders(),
  );

  const schemaSearch = await safeFetchJson<GithubSearchResponse>(
    `https://api.github.com/search/code?q=${encodeURIComponent('"eval-report-v1.schema.json" "@icodenet/eval-dashboards"')}`,
    githubHeaders(),
  );

  const manualSignals = await loadManualSignals();

  return {
    generatedAt: new Date().toISOString(),
    repository: REPOSITORY,
    npm: {
      packageName: PACKAGE_NAME,
      weeklyDownloads: npmPoint?.downloads ?? null,
    },
    github: {
      stars: repo?.stargazers_count ?? null,
      forks: repo?.forks_count ?? null,
      openIssues: repo?.open_issues_count ?? null,
      schemaCitationSearchCount: schemaSearch?.total_count ?? null,
    },
    manualSignals,
    targets: {
      externalRunnersDiscovered: 5,
      externalRunnerAdoptions: 1,
      schemaCitationsVerified: 2,
      weeklyDownloads: 100,
    },
  };
};

const printSummary = (snapshot: AdoptionSnapshot): void => {
  const lines = [
    `Adoption snapshot generated: ${snapshot.generatedAt}`,
    `Repository: ${snapshot.repository}`,
    `npm weekly downloads: ${snapshot.npm.weeklyDownloads ?? 'n/a'} (target ${snapshot.targets.weeklyDownloads})`,
    `GitHub stars: ${snapshot.github.stars ?? 'n/a'} (target ${snapshot.targets.externalRunnersDiscovered})`,
    `Manual external runner adoptions: ${snapshot.manualSignals.externalRunnerAdoptions} (target ${snapshot.targets.externalRunnerAdoptions})`,
    `Schema citations (manual verified): ${snapshot.manualSignals.schemaCitationsVerified} (target ${snapshot.targets.schemaCitationsVerified})`,
    `Schema citation search count (auto): ${snapshot.github.schemaCitationSearchCount ?? 'n/a'}`,
  ];

  process.stdout.write(`${lines.join('\n')}\n`);
};

const main = async (): Promise<void> => {
  await mkdir(OUTPUT_DIR, { recursive: true });
  await writeIfMissingManualSignals();

  const snapshot = await collect();
  await writeFile(SNAPSHOT_PATH, `${JSON.stringify(snapshot, null, 2)}\n`, 'utf8');
  printSummary(snapshot);
};

await main();
