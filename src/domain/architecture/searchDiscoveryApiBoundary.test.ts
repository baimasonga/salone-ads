import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const readSource = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');
const api = readSource('src/lib/searchDiscoveryApi.ts');
const facade = readSource('src/lib/api.ts');
const app = readSource('src/App.tsx');

describe('search discovery API boundary', () => {
  it('keeps discovery access in one focused module and reuses existing foundations', () => {
    expect(facade).toContain("export * from './searchDiscoveryApi'");
    expect(api).toContain("supabase.rpc('search_discovery'");
    expect(api).toContain(".from('saved_searches')");
    expect(api).not.toContain(".from('service_requests')");
  });

  it('loads the global search route lazily', () => {
    expect(app).toContain("lazy(() => import('./components/AdvancedSearchPage')");
    expect(app).toContain('<Route path="/search"');
  });
});
