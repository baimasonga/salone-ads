// @vitest-environment node
import express from 'express';
import type { Server } from 'node:http';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { registerAiRoutes } from './routes';
let server: Server;
let base: string;
beforeEach(async () => {
  vi.stubEnv('GEMINI_API_KEY', '');
  const app = express(); app.use(express.json());
  registerAiRoutes(app, (req, _res, next) => { Object.assign(req, { userId: 'test-user' }); next(); });
  server = app.listen(0, '127.0.0.1');
  await new Promise<void>(resolve => server.once('listening', resolve));
  base = `http://127.0.0.1:${(server.address() as { port: number }).port}/api/gemini/`;
});
afterEach(async () => { vi.unstubAllEnvs(); await new Promise<void>(resolve => server.close(() => resolve())); });
const post = (route: string, body: unknown) => fetch(base + route, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
describe('AI without a configured provider', () => {
  it.each([
    ['generate', { prompt: 'Campaign', option: 'captions' }],
    ['generate', { prompt: 'Campaign', option: 'brief' }],
    ['lead-followup', { leadName: 'Customer', channel: 'email' }],
    ['content-plan', { campaignName: 'Campaign', startDate: '2026-10-01', endDate: '2026-10-31' }],
  ])('returns an actionable unavailable error for %s instead of invented output', async (route, body) => {
    const response = await post(route, body); const result = await response.json();
    expect(response.status).toBe(503); expect(result.error.code).toBe('AI_UNAVAILABLE');
    expect(result.items).toBeUndefined(); expect(result.text).toBeUndefined();
  });
  it('retains a narrow advert draft based only on the supplied text', async () => {
    const response = await post('advert-copy', { subject: 'Office supplies.', description: 'Contact us for prices.' });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ headline: 'Office supplies', body: 'Contact us for prices.' });
  });
  it('retains deterministic document analysis', async () => {
    const response = await post('procurement-assist', { mode: 'analyze_document', text: 'Submit a tax certificate. Deadline: 30 November 2026.' });
    expect(response.status).toBe(200); expect((await response.json()).model).toBe('local-deterministic-v1');
  });
  it('does not fabricate a sector match', async () => {
    const response = await post('procurement-assist', { mode: 'suggest_sector', text: 'Unclassified work', sectorNames: ['Agriculture', 'Construction'] });
    expect(await response.json()).toEqual({ text: 'General' });
  });
  it('rejects reversed dates before provider work', async () => {
    expect((await post('content-plan', { campaignName: 'Campaign', startDate: '2026-10-31', endDate: '2026-10-01' })).status).toBe(400);
  });
});
