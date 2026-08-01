import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const advertisingApi = readFileSync(resolve(process.cwd(), 'src/lib/advertisingApi.ts'), 'utf8');
const procurementApi = readFileSync(resolve(process.cwd(), 'src/lib/procurementApi.ts'), 'utf8');
const campaignBuilder = readFileSync(resolve(process.cwd(), 'src/components/CampaignBuilderPage.tsx'), 'utf8');
const advertPublisher = readFileSync(resolve(process.cwd(), 'src/components/AdminAdvertPublisherPanel.tsx'), 'utf8');
const subscriberAdvertising = readFileSync(resolve(process.cwd(), 'src/components/SubscriberAdvertisingWorkspace.tsx'), 'utf8');

describe('advertising API domain boundary', () => {
  it('owns the advertising request, publishing, analytics and campaign operations', () => {
    expect(advertisingApi).toContain('submitAdvertisementRequest');
    expect(advertisingApi).toContain('fetchAdvertAnalyticsSummary');
    expect(advertisingApi).toContain('buildAdvertSharePack');
    expect(advertisingApi).toContain('fetchCampaignsForWorkspace');
    expect(advertisingApi).toContain('reviewCampaign');
    expect(advertisingApi).toContain('uploadAdvertCreative');
  });

  it('keeps procurementApi as a compatibility facade without duplicate implementations', () => {
    expect(procurementApi).toContain("export * from './advertisingApi'");
    expect(procurementApi).not.toContain('export async function submitAdvertisementRequest');
    expect(procurementApi).not.toContain('export async function createAdvert(');
    expect(procurementApi).not.toContain('export async function createCampaign(');
    expect(procurementApi.split('\n').length).toBeLessThan(2_400);
    expect(advertisingApi.split('\n').length).toBeGreaterThan(700);
  });

  it('routes focused advertising consumers directly to the new module', () => {
    expect(campaignBuilder).toContain("from '../lib/advertisingApi'");
    expect(advertPublisher).toContain("from '../lib/advertisingApi'");
    expect(subscriberAdvertising).toContain("from '../lib/advertisingApi'");
  });
});
