import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (path: string) => readFileSync(path, 'utf8');

describe('Hyderra brand transition', () => {
  it('uses Hyderra in customer-facing entry points', () => {
    expect(read('index.html')).toContain('<title>Hyderra</title>');
    expect(read('src/App.tsx')).toContain('>Hyderra</span>');
    expect(read('server/email/templates.ts')).toContain('HYD<span style="color:#10b981">ERRA</span>');
    expect(read('src/components/LandingPage.tsx')).not.toContain('MANO<span');
    expect(read('src/components/InsightsPage.tsx')).not.toContain('MANO<span');
    expect(read('src/components/CmsArticlePage.tsx')).not.toContain('MANO<span');
  });

  it('preserves infrastructure identifiers needed by the live deployment', () => {
    expect(read('wrangler.containers.toml')).toContain('MANOHUB_CONTAINER');
    expect(read('worker/index.ts')).toContain('ManohubContainer');
    expect(read('server.ts')).toContain('MANOHUB_ENVIRONMENT');
  });

  it('keeps mirrored forward-only migrations byte-identical', () => {
    expect(read('supabase/migrations/20260815210000_hyderra_brand_transition.sql'))
      .toBe(read('migrations/manohub-new-project/86_hyderra_brand_transition.sql'));
  });
});
