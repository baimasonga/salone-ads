// @vitest-environment node
import express from 'express';
import { afterEach, describe, expect, it } from 'vitest';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { Server } from 'node:http';
import { serveFrontend } from './frontend';

let server: Server;
let directory: string;
afterEach(async () => {
  if (server) await new Promise<void>(resolve => server.close(() => resolve()));
  if (directory) await rm(directory, { recursive: true, force: true });
});
describe('public frontend files', () => {
  it('serves browser assets but blocks backend source and source maps', async () => {
    directory = await mkdtemp(path.join(tmpdir(), 'frontend-'));
    for (const name of ['index.html', 'server.cjs', 'server.cjs.map', 'bundle.js']) await writeFile(path.join(directory, name), name);
    const app = express();
    app.use(serveFrontend(directory));
    server = app.listen(0, '127.0.0.1');
    await new Promise<void>(resolve => server.once('listening', resolve));
    const base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
    for (const name of ['server.cjs', 'server.cjs.map', '%73erver.cjs', 'server%2ecjs']) {
      expect((await fetch(`${base}/${name}`)).status).toBe(404);
    }
    expect(await (await fetch(`${base}/bundle.js`)).text()).toBe('bundle.js');
    expect(await (await fetch(base)).text()).toBe('index.html');
  });
});
