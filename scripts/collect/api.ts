const BASE = 'https://api.onstove.com/pub-meta/v1.0/epic7/guide/';

export class ApiError extends Error {}

export function unwrap<T>(raw: unknown): T {
  const r = raw as { code?: unknown; message?: unknown; value?: unknown } | null;
  if (typeof r !== 'object' || r === null || r.code !== 0 || !('value' in r)) {
    throw new ApiError(`bad API response: ${JSON.stringify(raw)?.slice(0, 200)}`);
  }
  return r.value as T;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function createClient(opts: { fetchFn?: typeof fetch; delayMs?: number; retries?: number } = {}) {
  const { fetchFn = fetch, delayMs = 250, retries = 2 } = opts;
  return {
    async get<T>(path: string, params: Record<string, string>): Promise<T> {
      const url = `${BASE}${path}?${new URLSearchParams(params)}`;
      for (let attempt = 0; ; attempt++) {
        await sleep(delayMs * 2 ** attempt);
        try {
          const res = await fetchFn(url, { signal: AbortSignal.timeout(20000) });
          if (!res.ok) throw new ApiError(`HTTP ${res.status} for ${url}`);
          const text = await res.text();
          let body: unknown;
          try {
            body = JSON.parse(text);
          } catch {
            throw new ApiError(`non-JSON body for ${url}: ${text.slice(0, 100)}`);
          }
          unwrap(body); // validates the envelope (retried on failure); mappers unwrap again
          return body as T;
        } catch (e) {
          if (attempt >= retries) throw e;
        }
      }
    },
  };
}
