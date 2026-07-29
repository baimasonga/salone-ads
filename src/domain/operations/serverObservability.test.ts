import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const server = readFileSync(resolve(process.cwd(), 'server.ts'), 'utf8');

describe('server observability foundation', () => {
  it('validates or creates a request correlation identifier', () => {
    expect(server).toContain('const REQUEST_ID_PATTERN');
    expect(server).toContain("req.get('x-request-id')");
    expect(server).toContain(': randomUUID()');
    expect(server).toContain("res.setHeader('x-request-id', requestId)");
  });

  it('emits structured completion logs with operational fields', () => {
    expect(server).toContain("'http.request.completed'");
    expect(server).toContain('status_code: res.statusCode');
    expect(server).toContain('duration_ms: durationMs');
    expect(server).toContain("path: req.originalUrl.split('?')[0]");
  });

  it('does not place raw user identifiers in request logs', () => {
    expect(server).toContain('user_correlation: correlationToken(context.userId)');
    expect(server).not.toContain('user_id: context.userId');
  });

  it('returns the correlation identifier from the health endpoint', () => {
    expect(server).toContain('requestId: res.locals.requestId');
    expect(server).toContain("app.use(requestObservability)");
  });

  it('uses structured startup and fatal-error events', () => {
    expect(server).toContain("'server.started'");
    expect(server).toContain("'server.startup.failed'");
  });
});
