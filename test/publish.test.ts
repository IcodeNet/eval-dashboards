import { describe, expect, it } from 'vitest';
import { publishReport } from '../src/publish/publish.js';

describe('publishReport', () => {
  it('supports azure-static-webapp dry-run validation', async () => {
    await expect(
      publishReport({
        target: 'azure-static-webapp',
        reportDir: 'eval-report',
        appName: 'demo-app',
        dryRun: true,
      }),
    ).resolves.toMatchObject({
      target: 'azure-static-webapp',
      dryRun: true,
      url: 'https://demo-app.azurestaticapps.net',
    });
  });

  it('rejects azure-static-webapp non-dry-run until execution path is implemented', async () => {
    await expect(
      publishReport({
        target: 'azure-static-webapp',
        reportDir: 'eval-report',
        appName: 'demo-app',
        dryRun: false,
      }),
    ).rejects.toThrow('azure-static-webapp non-dry-run publish is not implemented yet');
  });
});
