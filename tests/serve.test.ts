import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';

const { serveDir } = createRequire(import.meta.url)('../electron/serve.cjs') as {
  serveDir: (root: string) => Promise<Server>;
};

let root: string;
let server: Server;
const get = async (path: string) => {
  const { port } = server.address() as AddressInfo;
  return fetch(`http://127.0.0.1:${port}${path}`);
};

beforeEach(async () => {
  root = mkdtempSync(join(tmpdir(), 'e7-serve-'));
  mkdirSync(join(root, 'data'));
  writeFileSync(join(root, 'index.html'), '<h1>E7</h1>');
  writeFileSync(join(root, 'data', 'index.json'), '{"periods":[]}');
  writeFileSync(join(root, '..', 'e7-secret.txt'), 'secret');
  server = await serveDir(root);
});
afterEach(() => {
  server.close();
  rmSync(root, { recursive: true, force: true });
  rmSync(join(root, '..', 'e7-secret.txt'), { force: true });
});

describe('serveDir', () => {
  it('serves index.html at / with an html content type', async () => {
    const res = await get('/');
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/html');
    expect(await res.text()).toBe('<h1>E7</h1>');
  });
  it('serves json files with a json content type (the site refuses other types as "no data")', async () => {
    const res = await get('/data/index.json');
    expect(res.headers.get('content-type')).toContain('application/json');
    expect(await res.json()).toEqual({ periods: [] });
  });
  it('answers 404 for a missing file', async () => expect((await get('/nope.json')).status).toBe(404));
  it('never leaves the root: ../ and encoded ../ get 404', async () => {
    expect((await get('/..%2fe7-secret.txt')).status).toBe(404);
    expect((await get('/%2e%2e/e7-secret.txt')).status).toBe(404);
  });
  it('listens on 127.0.0.1 only', () => expect((server.address() as AddressInfo).address).toBe('127.0.0.1'));
});
