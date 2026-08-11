import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(resolve(process.cwd(), 'migrations/manohub-new-project/81_advanced_search_discovery.sql'), 'utf8');
const page = readFileSync(resolve(process.cwd(), 'src/components/AdvancedSearchPage.tsx'), 'utf8');

describe('advanced search and discovery', () => {
  it('searches only the seven approved public discovery types', () => {
    for (const type of ['tender', 'award', 'project', 'advert', 'service', 'business', 'influencer']) {
      expect(migration).toContain(`'${type}'`);
    }
    expect(migration).not.toContain('public.service_requests');
    expect(migration).not.toContain('public.ad_campaigns');
    expect(migration).not.toContain('public.agency_relationships');
  });

  it('excludes demo and unverified discovery profiles', () => {
    expect(migration).toContain('business.is_verified');
    expect(migration).toContain('influencer.is_verified');
    expect(migration).toContain('business_org.is_demo');
    expect(migration).toContain('advert_org.is_demo');
  });

  it('reveals business contacts only to signed-in users', () => {
    expect(migration).toContain("auth.uid() is not null and measured.record_type = 'business'");
  });

  it('labels sponsored and district-matched results in the interface', () => {
    expect(page).toContain('Sponsored advert');
    expect(page).toContain('District match');
    expect(page).toContain('Nearby businesses');
  });

  it('includes deliberate loading, cached, error and empty states', () => {
    expect(page).toContain('Searching trusted Manohub records');
    expect(page).toContain('Showing cached results');
    expect(page).toContain('Search is temporarily unavailable');
    expect(page).toContain('No verified results found');
  });
});
