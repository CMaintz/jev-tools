import { afterEach, describe, expect, it, vi } from 'vitest';
import { CloudflareProvider, postJson, TypeSafeProvider, type JevRequest } from '../src/index.js';

const req: JevRequest = {
  state: { title: 'x' },
  questions: { spam: { type: 'noul', instructions: 'Is this spam?' } },
};
const body = { model: 'jev-latest', answers: { spam: { type: 'noul', noul: 0.1 } } };

function mockFetch(...responses: Response[]) {
  const fn = vi.fn<typeof fetch>();
  for (const r of responses) fn.mockResolvedValueOnce(r);
  vi.stubGlobal('fetch', fn);
  return fn;
}
const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('TypeSafeProvider', () => {
  it('posts model, state and questions to /systemone with a bearer key', async () => {
    const fetchMock = mockFetch(json(body));
    const res = await new TypeSafeProvider('key-1').evaluate(req);

    expect(res.answers.spam).toEqual({ type: 'noul', noul: 0.1 });
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('https://api.typesafe.ai/v1/systemone');
    expect((init?.headers as Record<string, string>).Authorization).toBe('Bearer key-1');
    expect(JSON.parse(init?.body as string)).toEqual({ model: 'jev-latest', ...req });
  });
});

describe('CloudflareProvider', () => {
  it('posts to the account ai/run endpoint with the model in the body', async () => {
    const fetchMock = mockFetch(json(body));
    await new CloudflareProvider('acct', 'tok').evaluate(req);

    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('https://api.cloudflare.com/client/v4/accounts/acct/ai/run');
    expect(JSON.parse(init?.body as string)).toEqual({ model: 'typesafe/jev', input: req });
  });
});

describe('postJson', () => {
  it('retries 429/529 with backoff, then succeeds', async () => {
    vi.useFakeTimers();
    const fetchMock = mockFetch(json({}, 429), json({}, 529), json({ ok: true }));
    const p = postJson('https://x.test', {}, {});
    await vi.runAllTimersAsync();
    await expect(p).resolves.toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('throws on a non-retryable status without retrying', async () => {
    const fetchMock = mockFetch(new Response('bad key', { status: 401 }));
    await expect(postJson('https://x.test', {}, {})).rejects.toThrow('Jev request failed: 401 bad key');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('gives up after maxAttempts on persistent 429', async () => {
    vi.useFakeTimers();
    mockFetch(json({}, 429), json({}, 429));
    const p = postJson('https://x.test', {}, {}, 2);
    const assertion = expect(p).rejects.toThrow('429');
    await vi.runAllTimersAsync();
    await assertion;
  });
});
