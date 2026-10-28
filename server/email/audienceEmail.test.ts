// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createAudienceEmailModule } from './audienceEmail';
import { sendEmail } from './emailProvider';
vi.mock('./emailProvider', () => ({ sendEmail: vi.fn(async () => 'message-id'), assertEmailConfigured: vi.fn(), supportsEmailRetryDeduplication: () => process.env.EMAIL_PROVIDER !== 'cloudflare' }));

function fixture(results: Array<{ data?: unknown; error?: unknown }>) {
  const writes: unknown[] = [];
  const client = { from: (table: string) => {
    const builder: Record<string, unknown> = {};
    for (const method of ['select', 'eq', 'in', 'order', 'limit', 'single', 'update']) {
      builder[method] = (...args: unknown[]) => { if (method === 'update') writes.push({ table, ...args[0] as object }); return builder; };
    }
    builder.then = (resolve: (value: unknown) => unknown) => {
      const result = results.shift(); if (!result) throw new Error('Unexpected database call');
      return Promise.resolve({ error: null, ...result }).then(resolve);
    };
    return builder;
  } } as unknown as SupabaseClient;
  const module = createAudienceEmailModule({ serviceClient: client, configuredAppOrigin: () => 'https://example.com', htmlEscape: v => v, structuredLog: vi.fn() });
  return { ...module, writes, results };
}
const campaign = { data: { id: 'campaign', status: 'queued', subject: 'Update', body: 'News' } };
const delivery = { id: 'delivery', status: 'queued', recipient_email: 'user@example.com', public_audience_subscribers: { status: 'active', unsubscribe_token: 'token' } };
beforeEach(() => { vi.stubEnv('RESEND_API_KEY', 'test'); vi.stubEnv('RESEND_FROM_EMAIL', 'test@example.com'); vi.mocked(sendEmail).mockClear(); });
afterEach(() => vi.unstubAllEnvs());
describe('audience dispatch persistence', () => {
  it('propagates status-query failure instead of declaring the campaign sent', async () => {
    const test = fixture([campaign, {}, { data: [] }, { error: new Error('status unavailable') }]);
    await expect(test.dispatchAudienceCampaign('campaign')).rejects.toThrow('status unavailable');
    expect(test.writes).not.toContainEqual(expect.objectContaining({ status: 'sent' }));
  });
  it('does not mark an accepted email failed when its sent-state write fails', async () => {
    const test = fixture([campaign, {}, { data: [delivery] }, {}, { error: new Error('write failed') }]);
    await expect(test.dispatchAudienceCampaign('campaign')).rejects.toThrow('write failed');
    expect(sendEmail).toHaveBeenCalledTimes(1);
    expect(test.writes).not.toContainEqual(expect.objectContaining({ status: 'failed' }));
  });
  it('recovers a recent uncertain send using the same provider idempotency key', async () => {
    const test = fixture([campaign, {}, { data: [{ ...delivery, status: 'sending', event_at: new Date().toISOString() }] }, {}, { data: [{ status: 'sent' }] }, {}]);
    await expect(test.dispatchAudienceCampaign('campaign')).resolves.toEqual({ sent: 1, failed: 0, remaining: 0 });
    expect(sendEmail).toHaveBeenCalledWith(expect.objectContaining({ idempotencyKey: 'manohub-audience-delivery' }));
    expect(test.results).toHaveLength(0);
  });
  it('refuses to resend an uncertain delivery after the provider deduplication window', async () => {
    const test = fixture([campaign, {}, { data: [{ ...delivery, status: 'sending', event_at: '2020-01-01T00:00:00Z' }] }]);
    await expect(test.dispatchAudienceCampaign('campaign')).rejects.toThrow('requires reconciliation');
    expect(sendEmail).not.toHaveBeenCalled();
  });
  it('requires reconciliation for a recent uncertain Cloudflare send', async () => {
    vi.stubEnv('EMAIL_PROVIDER', 'cloudflare');
    const test = fixture([campaign, {}, { data: [{ ...delivery, status: 'sending', event_at: new Date().toISOString() }] }]);
    await expect(test.dispatchAudienceCampaign('campaign')).rejects.toThrow('requires reconciliation');
    expect(sendEmail).not.toHaveBeenCalled();
  });
  it('preserves uncertain Cloudflare sends when the request fails', async () => {
    vi.stubEnv('EMAIL_PROVIDER', 'cloudflare');
    vi.mocked(sendEmail).mockRejectedValueOnce(new Error('request interrupted'));
    const test = fixture([campaign, {}, { data: [delivery] }, {}]);
    await expect(test.dispatchAudienceCampaign('campaign')).rejects.toThrow('request interrupted');
    expect(test.writes).not.toContainEqual(expect.objectContaining({ status: 'failed' }));
  });
  it('propagates final campaign-update failure', async () => {
    const test = fixture([campaign, {}, { data: [] }, { data: [] }, { error: new Error('campaign write failed') }]);
    await expect(test.dispatchAudienceCampaign('campaign')).rejects.toThrow('campaign write failed');
  });
});
