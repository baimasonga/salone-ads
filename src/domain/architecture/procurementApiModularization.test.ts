import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');
const facade = read('src/lib/procurementApi.ts');

describe('procurement API module boundaries', () => {
  it.each([
    ['notificationApi', 'fetchMyNotifications'],
    ['teamApi', 'fetchTeamMembers'],
    ['subscriptionRequestApi', 'fetchPlans'],
    ['serviceRequestApi', 'createServiceRequest'],
  ])('delegates %s through the compatibility facade', (moduleName, representativeExport) => {
    expect(facade).toContain(`export * from './procurement/${moduleName}'`);
    expect(read(`src/lib/procurement/${moduleName}.ts`)).toContain(`function ${representativeExport}`);
  });

  it('keeps extracted implementations out of the legacy facade', () => {
    for (const implementation of ['function fetchMyNotifications', 'function fetchTeamMembers', 'function fetchPlans', 'function createServiceRequest']) {
      expect(facade).not.toContain(implementation);
    }
  });
});
