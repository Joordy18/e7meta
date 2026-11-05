import { describe, expect, it, vi } from 'vitest';
import { ApiError, createClient, unwrap } from '../scripts/collect/api';

const ok = (value: unknown) => new Response(JSON.stringify({ code: 0, message: 'OK', value }));

describe('unwrap', () => {
  it('returns value', () => expect(unwrap({ code: 0, message: 'OK', value: { a: 1 } })).toEqual({ a: 1 }));
  it('throws ApiError on a non-zero code', () => {
    expect(() => unwrap({ code: 500, message: 'x' })).toThrow(ApiError);
  });
  it('throws ApiError on a string body', () => expect(() => unwrap('oops')).toThrow(ApiError));
});

describe('createClient', () => {
  it('retries failures then returns the value', async () => {
    const fetchFn = vi.fn()
      .mockRejectedValueOnce(new Error('net'))
      .mockResolvedValueOnce(new Response('{"code":500}'))
      .mockResolvedValueOnce(ok({ x: 1 }));
    const c = createClient({ fetchFn: fetchFn as unknown as typeof fetch, delayMs: 0 });
    expect(await c.get('wearing-status/hero-list', { a: 'b' })).toEqual({ x: 1 });
    expect(fetchFn).toHaveBeenCalledTimes(3);
    expect(String(fetchFn.mock.calls[0][0])).toBe(
      'https://api.onstove.com/pub-meta/v1.0/epic7/guide/wearing-status/hero-list?a=b',
    );
  });
  it('throws after three failures', async () => {
    const fetchFn = vi.fn().mockRejectedValue(new Error('net'));
    const c = createClient({ fetchFn: fetchFn as unknown as typeof fetch, delayMs: 0 });
    await expect(c.get('p', {})).rejects.toThrow('net');
    expect(fetchFn).toHaveBeenCalledTimes(3);
  });
  it('throws ApiError after three {code:500} bodies', async () => {
    const fetchFn = vi.fn().mockImplementation(async () => new Response('{"code":500}'));
    const c = createClient({ fetchFn: fetchFn as unknown as typeof fetch, delayMs: 0 });
    await expect(c.get('p', {})).rejects.toBeInstanceOf(ApiError);
    expect(fetchFn).toHaveBeenCalledTimes(3);
  });
  it('surfaces an HTML body as ApiError and retries it', async () => {
    const fetchFn = vi.fn().mockImplementation(async () => new Response('<html>Bad gateway</html>'));
    const c = createClient({ fetchFn: fetchFn as unknown as typeof fetch, delayMs: 0 });
    await expect(c.get('p', {})).rejects.toBeInstanceOf(ApiError);
    expect(fetchFn).toHaveBeenCalledTimes(3);
  });
  it('passes a timeout signal to fetch', async () => {
    const fetchFn = vi.fn().mockResolvedValue(ok({ x: 1 }));
    const c = createClient({ fetchFn: fetchFn as unknown as typeof fetch, delayMs: 0 });
    await c.get('p', {});
    expect(fetchFn.mock.calls[0][1].signal).toBeInstanceOf(AbortSignal);
  });
});
