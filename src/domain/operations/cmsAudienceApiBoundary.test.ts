import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');
const procurementApi = read('src/lib/procurementApi.ts');
const insightsApi = read('src/lib/procurement/insightsApi.ts');
const landingCmsApi = read('src/lib/landingCmsApi.ts');
const audienceApi = read('src/lib/audienceApi.ts');
const landingCmsPage = read('src/components/LandingCmsPage.tsx');
const landingPage = read('src/components/LandingPage.tsx');
const audienceCampaigns = read('src/components/AudienceEmailCampaignsPage.tsx');
const audienceSubscribers = read('src/components/AudienceSubscribersPage.tsx');
const publicSubscription = read('src/components/PublicSubscriptionSection.tsx');
const unsubscribePage = read('src/components/UnsubscribePage.tsx');

describe('CMS and audience API boundaries', () => {
  it('gives the landing CMS module ownership of homepage publishing and advert inventory', () => {
    for (const operation of [
      'fetchLandingContent',
      'createLandingContentBlock',
      'updateLandingContent',
      'fetchLandingContentRevisions',
      'fetchLandingAdvertPlacements',
      'assignLandingAdvert',
    ]) {
      expect(landingCmsApi).toContain(`function ${operation}`);
      expect(procurementApi).not.toContain(`function ${operation}`);
    }
    expect(landingCmsApi).toContain("from './advertisingApi'");
  });

  it('gives the audience module ownership of consent and email campaign delivery', () => {
    for (const operation of [
      'subscribePublicAudience',
      'unsubscribePublicAudience',
      'fetchPublicAudienceSubscribers',
      'fetchAudienceEmailCampaigns',
      'createAudienceEmailCampaign',
      'queueAudienceEmailCampaign',
      'sendAudienceEmailTest',
      'dispatchAudienceEmailCampaign',
    ]) {
      expect(audienceApi).toContain(`function ${operation}`);
      expect(procurementApi).not.toContain(`function ${operation}`);
    }
  });

  it('keeps tender alert delivery reporting in the procurement domain', () => {
    expect(procurementApi).toContain("export * from './procurement/insightsApi'");
    expect(insightsApi).toContain('function fetchTenderAlertDeliverySummary');
    expect(audienceApi).not.toContain('function fetchTenderAlertDeliverySummary');
    expect(audienceCampaigns).toContain("from '../lib/procurement/insightsApi'");
  });

  it('routes focused consumers directly to the authoritative modules', () => {
    expect(landingCmsPage).toContain("from '../lib/landingCmsApi'");
    expect(landingPage).toContain("from '../lib/landingCmsApi'");
    expect(audienceCampaigns).toContain("from '../lib/audienceApi'");
    expect(audienceSubscribers).toContain("from '../lib/audienceApi'");
    expect(publicSubscription).toContain("from '../lib/audienceApi'");
    expect(unsubscribePage).toContain("from '../lib/audienceApi'");
  });

  it('keeps temporary compatibility exports without duplicate implementations', () => {
    expect(procurementApi).toContain("export * from './landingCmsApi'");
    expect(procurementApi).toContain("export * from './audienceApi'");
    expect(procurementApi.split('\n').length).toBeLessThan(1_800);
  });
});
