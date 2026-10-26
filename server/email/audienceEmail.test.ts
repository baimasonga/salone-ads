// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createAudienceEmailModule } from './audienceEmail';
import { sendResendEmail } from './resendProvider';
vi.mock('./resendProvider', () => ({ sendResendEmail: vi.fn(async () => 'message-id'), resendEventMetadata: vi.fn(), verifyResendWebhook: vi.fn() }));

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
beforeEach(() => { vi.stubEnv('RESEND_API_KEY', 'test'); vi.stubEnv('RESEND_FROM_EMAIL', 'test@example.com'); vi.mocked(sendResendEmail).mockClear(); });
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
    expect(sendResendEmail).toHaveBeenCalledTimes(1);
    expect(test.writes).not.toContainEqual(expect.objectContaining({ status: 'failed' }));
  });
  it('recovers a recent uncertain send using the same provider idempotency key', async () => {
    const test = fixture([campaign, {}, { data: [{ ...delivery, status: 'sending', event_at: new Date().toISOString() }] }, {}, { data: [{ status: 'sent' }] }, {}]);
    await expect(test.dispatchAudienceCampaign('campaign')).resolves.toEqual({ sent: 1, failed: 0, remaining: 0 });
    expect(sendResendEmail).toHaveBeenCalledWith(expect.objectContaining({ idempotencyKey: 'manohub-audience-delivery' }));
    expect(test.results).toHaveLength(0);
  });
  it('refuses to resend an uncertain delivery after the provider deduplication window', async () => {
    const test = fixture([campaign, {}, { data: [{ ...delivery, status: 'sending', event_at: '2020-01-01T00:00:00Z' }] }]);
    await expect(test.dispatchAudienceCampaign('campaign')).rejects.toThrow('requires reconciliation');
    expect(sendResendEmail).not.toHaveBeenCalled();
  });
  it('propagates final campaign-update failure', async () => {
    const test = fixture([campaign, {}, { data: [] }, { data: [] }, { error: new Error('campaign write failed') }]);
    await expect(test.dispatchAudienceCampaign('campaign')).rejects.toThrow('campaign write failed');
  });
});
