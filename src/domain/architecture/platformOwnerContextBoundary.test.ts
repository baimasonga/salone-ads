import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const app = readFileSync('src/App.tsx', 'utf8');
const navigation = readFileSync('src/config/workspaceNavigation.ts', 'utf8');

describe('platform owner workspace boundary', () => {
  it('presents the platform owner separately from subscriber organisations', () => {
    expect(app).toContain("isPlatformAdmin ? 'PLATFORM.OWNER' : 'SYSTEM.CONTEXT'");
    expect(app).toContain('Quantix Sierra Leone');
    expect(app).toContain("isPlatformAdmin ? 'Platform Administrator' : activeOrg.type");
  });

  it('routes platform owners to subscriber administration instead of an organisation agency page', () => {
    expect(navigation).toContain("{ id: 'admin-organizations', label: 'Subscriber Management'");
    expect(navigation).not.toContain("{ id: 'agency-workspace', label: 'Agency Clients'");
  });
});
