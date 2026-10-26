// @vitest-environment node
import express from 'express';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Server } from 'node:http';
import type { SupabaseClient } from '@supabase/supabase-js';
import { registerProtectedUploads } from './uploads';
let server: Server;
afterEach(async () => { if (server) await new Promise<void>(resolve => server.close(() => resolve())); });

async function setup(options: { clean?: boolean; authorized?: boolean; service?: boolean } = {}) {
  const scan = vi.fn(async () => ({ clean: options.clean !== false, detail: '' }));
  const upload = vi.fn(async () => ({ error: null }));
  const sign = vi.fn(async () => options.authorized === false ? { error: new Error('denied'), data: null } : { error: null, data: { token: 'server-only-token' } });
  const remove = vi.fn(async () => ({ error: null }));
  const insert = vi.fn(() => ({ select: () => ({ single: async () => ({ data: { id: 'grant' }, error: null }) }) }));
  const audit = vi.fn(async () => ({ error: null }));
  const service = { from: (table: string) => table === 'upload_security_events' ? { insert: audit } : ({ insert, delete: () => ({ eq: remove }) }) } as unknown as SupabaseClient;
  const client = { storage: { from: () => ({ createSignedUploadUrl: sign, uploadToSignedUrl: upload }) } } as unknown as SupabaseClient;
  const app = express();
  registerProtectedUploads(app, {
    requireUser: (req, _res, next) => { Object.assign(req, { userId: 'user' }); next(); },
    scanRateLimiter: (_req, _res, next) => next(), scan,
    serviceClient: options.service === false ? null : service, userClient: () => client,
  });
  app.use((error: Error & { status?: number }, _req: express.Request, res: express.Response, _next: express.NextFunction) => res.status(error.status || 500).json({ error: error.message }));
  server = app.listen(0, '127.0.0.1');
  await new Promise<void>(resolve => server.once('listening', resolve));
  const request = (path = 'org/document.pdf', contentType = 'application/pdf', body = '%PDF-scanned-bytes') => fetch(`http://127.0.0.1:${(server.address() as { port: number }).port}/api/security/upload`, {
    method: 'POST', headers: { 'Content-Type': contentType, 'X-Upload-Bucket': 'bid-submissions', 'X-Upload-Path': encodeURIComponent(path) }, body,
  });
  return { request, scan, upload, sign, remove, insert, audit };
}
describe('protected upload endpoint', () => {
  it('stores exactly the scanned bytes under a server-generated name and cleans authorization', async () => {
    const test = await setup(); const response = await test.request();
    expect(response.status).toBe(201);
    const { path } = await response.json();
    expect(path).toMatch(/^org\/[a-f0-9-]{36}-document.pdf$/);
    expect(test.sign).toHaveBeenCalledWith(path);
    expect(test.upload.mock.calls[0]).toEqual([path, 'server-only-token', Buffer.from('%PDF-scanned-bytes'), { contentType: 'application/pdf', upsert: false }]);
    expect(test.scan).toHaveBeenCalledWith(Buffer.from('%PDF-scanned-bytes'));
    expect(test.remove).toHaveBeenCalledWith('id', 'grant');
    expect(test.audit).toHaveBeenCalledWith(expect.objectContaining({ verdict: 'clean', file_kind: 'document' }));
  });
  it('does not store malware', async () => {
    const test = await setup({ clean: false });
    expect((await test.request()).status).toBe(422);
    expect(test.upload).not.toHaveBeenCalled(); expect(test.remove).toHaveBeenCalled();
    expect(test.audit).toHaveBeenCalledWith(expect.objectContaining({ verdict: 'blocked' }));
  });
  it('enforces destination authorization before scanning or storing', async () => {
    const test = await setup({ authorized: false });
    expect((await test.request()).status).toBe(403);
    expect(test.scan).not.toHaveBeenCalled(); expect(test.upload).not.toHaveBeenCalled();
  });
  it('rejects traversal and fails closed without server credentials', async () => {
    const test = await setup(); expect((await test.request('org/../file.pdf')).status).toBe(400);
    expect(test.insert).not.toHaveBeenCalled();
  });
  it('rejects active content and a forged file signature before storage authorization', async () => {
    const test = await setup();
    expect((await test.request('org/file.html', 'text/html', '<script>alert(1)</script>')).status).toBe(400);
    expect((await test.request('org/file.pdf', 'application/pdf', '<html>not a PDF</html>')).status).toBe(400);
    expect(test.insert).not.toHaveBeenCalled();
    expect(test.upload).not.toHaveBeenCalled();
  });
  it('fails closed without server credentials', async () => {
    const test = await setup({ service: false }); expect((await test.request()).status).toBe(503);
    expect(test.upload).not.toHaveBeenCalled();
  });
});
