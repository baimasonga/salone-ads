// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('../../functions/api/_lib/shared', async importOriginal => ({
  ...await importOriginal<typeof import('../../functions/api/_lib/shared')>(),
  requireUserId: vi.fn(async () => 'user'), checkRateLimit: vi.fn(async () => true),
  callGemini: vi.fn(async () => { throw new Error('NO_KEY'); }),
}));
import { onRequestPost as generate } from '../../functions/api/gemini/generate';
import { onRequestPost as followup } from '../../functions/api/gemini/lead-followup';
import { onRequestPost as contentPlan } from '../../functions/api/gemini/content-plan';
import { onRequestPost as advertCopy } from '../../functions/api/gemini/advert-copy';
import type { Env } from '../../functions/api/_lib/shared';
beforeEach(() => vi.clearAllMocks());
function context(body: unknown) { return { request: new Request('https://example.com/api/gemini', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }), env: {} as Env }; }
describe('alternative AI runtime parity', () => {
  it.each([
    ['content generation', generate, { prompt: 'Campaign', option: 'captions' }],
    ['follow-up', followup, { leadName: 'Customer', channel: 'email' }],
    ['content plan', contentPlan, { campaignName: 'Campaign', startDate: '2026-10-01', endDate: '2026-10-31' }],
  ])('returns unavailable for %s without inventing drafts', async (_name, handler, body) => {
    const response = await handler(context(body));
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: expect.objectContaining({ code: 'AI_UNAVAILABLE' }) });
  });
  it('keeps the same text-only advert draft as Express', async () => {
    const response = await advertCopy(context({ subject: 'Office supplies.', description: 'Contact us for prices.' }));
    expect(await response.json()).toEqual({ headline: 'Office supplies', body: 'Contact us for prices.' });
  });
});
