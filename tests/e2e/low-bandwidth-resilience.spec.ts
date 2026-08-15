import { expect, test } from '@playwright/test';

test('tender discovery keeps saved results when the network refresh fails', async ({ page }) => {
  const cachedTender = {
    id: 'cached-tender-1',
    slug: 'cached-rural-connectivity',
    title: 'Cached Rural Connectivity Tender',
    buyerName: 'Hyderra Test Buyer',
    submissionDeadline: '2099-12-31T23:59:00.000Z',
    estimatedValue: 125000,
    currencyCode: 'SLE',
    isFeatured: false,
    sector: 'Telecommunications & ICT',
    district: 'Bo',
    country: 'Sierra Leone',
    opportunityType: 'Request for Proposal',
    statusCode: 'published',
    statusLabel: 'Published',
    reviewNote: null,
    viewCount: 0,
  };

  await page.addInitScript((tender) => {
    localStorage.setItem(
      'manohub:resilience:v1:tender-search:{"status":"all","sort":"relevance"}',
      JSON.stringify({ savedAt: Date.now(), value: [tender] }),
    );
  }, cachedTender);
  await page.route('**/rest/v1/rpc/search_public_opportunities**', (route) => route.abort('internetdisconnected'));

  await page.goto('/tenders');

  await expect(page.getByText('Cached Rural Connectivity Tender')).toBeVisible();
  await expect(page.getByTestId('tender-network-notice')).toContainText('Saved results');
});
