import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const server = readFileSync(resolve(process.cwd(), 'server.ts'), 'utf8');

describe('API error normalization', () => {
  it('returns JSON for unknown API routes instead of the SPA shell', () => {
    expect(server).toContain("app.use('/api', (req, res)");
    expect(server).toContain("code: 'API_ROUTE_NOT_FOUND'");
    expect(server).toContain('requestId: res.locals.requestId');
  });

  it('uses one centralized Express error boundary', () => {
    expect(server).toContain('error: unknown');
    expect(server).toContain("'http.request.failed'");
    expect(server).toContain('if (res.headersSent)');
  });

  it('does not expose unexpected server messages to clients', () => {
    expect(server).toContain("statusCode >= 500 ? 'INTERNAL_SERVER_ERROR'");
    expect(server).toContain("'An unexpected server error occurred.'");
    expect(server).toContain('const exposeMessage = statusCode < 500');
  });

  it('correlates failure logs and responses with the request identifier', () => {
    expect(server).toContain('request_id: requestId');
    expect(server).toContain('requestId,');
    expect(server).toContain("path: req.originalUrl.split('?')[0]");
  });

  it('records process-level failures in the structured log stream', () => {
    expect(server).toContain("process.on('unhandledRejection'");
    expect(server).toContain("process.on('uncaughtExceptionMonitor'");
    expect(server).toContain("'process.unhandled_rejection'");
    expect(server).toContain("'process.uncaught_exception'");
  });
});
