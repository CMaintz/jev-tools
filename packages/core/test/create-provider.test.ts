import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  CloudflareProvider,
  createProvider,
  JevRequestError,
  providerFromEnv,
  TypeSafeProvider,
} from '../src/index.js';

/** Evaluate once against a stubbed fetch and return the URL and parsed body that were sent. */
async function sentBy(provider: ReturnType<typeof createProvider>) {
  const fetchMock = vi.fn<typeof fetch>(async () => new Response(JSON.stringify({ model: 'm', answers: {} })));
  vi.stubGlobal('fetch', fetchMock);
  await provider.evaluate({ state: {}, questions: {} });
  const [url, init] = fetchMock.mock.calls[0]!;
  return { url, model: (JSON.parse(init?.body as string) as { model: string }).model };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('createProvider typesafe', () => {
  it('defaults to TypeSafe with jev-latest', async () => {
    const provider = createProvider({ apiKey: 'k' });
    expect(provider).toBeInstanceOf(TypeSafeProvider);
    expect(await sentBy(provider)).toEqual({ url: 'https://api.typesafe.ai/v1/systemone', model: 'jev-latest' });
  });

  it('honours model and baseUrl', async () => {
    const provider = createProvider({ apiKey: 'k', model: 'jev-1.13.0', baseUrl: 'http://localhost:9/v1' });
    expect(await sentBy(provider)).toEqual({ url: 'http://localhost:9/v1/systemone', model: 'jev-1.13.0' });
  });
});

describe('createProvider cloudflare', () => {
  it.each([
    [undefined, 'typesafe/jev'],
    ['jev-latest', 'typesafe/jev'],
    ['@cf/typesafe/jev-next', '@cf/typesafe/jev-next'],
  ])('model %s is sent as %s', async (model, sent) => {
    const provider = createProvider({
      provider: 'cloudflare',
      apiKey: 't',
      accountId: 'a',
      ...(model ? { model } : {}),
    });
    expect(provider).toBeInstanceOf(CloudflareProvider);
    expect((await sentBy(provider)).model).toBe(sent);
  });

  it('maps jev-latest from the environment too', async () => {
    const env = { JEV_PROVIDER: 'cloudflare', JEV_API_KEY: 't', CLOUDFLARE_ACCOUNT_ID: 'a', JEV_MODEL: 'jev-latest' };
    expect((await sentBy(providerFromEnv(env)!)).model).toBe('typesafe/jev');
  });
});

describe('createProvider rejects incomplete settings', () => {
  it.each([
    [{ apiKey: '' }, 'needs an API key'],
    [{ provider: 'cloudflare' as const, apiKey: 't' }, 'needs an account id'],
    [{ provider: 'azure' as never, apiKey: 't' }, 'unknown Jev provider "azure"'],
  ])('%j', (config, message) => {
    expect(() => createProvider(config)).toThrow(JevRequestError);
    expect(() => createProvider(config)).toThrow(message);
  });
});

describe('timeoutMs', () => {
  /** A fetch that never settles until its signal aborts. */
  function hang() {
    vi.stubGlobal(
      'fetch',
      vi.fn<typeof fetch>(
        (_url, init) =>
          new Promise((_resolve, reject) => {
            init?.signal?.addEventListener('abort', () => reject(init.signal?.reason));
          }),
      ),
    );
  }

  it.each([
    ['typesafe', { apiKey: 'k', timeoutMs: 15 }],
    ['cloudflare', { provider: 'cloudflare' as const, apiKey: 't', accountId: 'a', timeoutMs: 15 }],
  ])('bounds each %s attempt by the configured timeout', async (_name, config) => {
    hang();
    await expect(createProvider(config).evaluate({ state: {}, questions: {} })).rejects.toThrow('timed out after 15 ms');
  });

  it('lets a single call override the provider timeout', async () => {
    hang();
    const provider = createProvider({ apiKey: 'k', timeoutMs: 60_000 });
    await expect(provider.evaluate({ state: {}, questions: {} }, { timeoutMs: 10 })).rejects.toThrow('after 10 ms');
  });

  it.each([
    ['25', { apiKey: 'k', timeoutMs: 25 }],
    ['nope', { apiKey: 'k' }],
    ['-5', { apiKey: 'k' }],
  ])('reads JEV_TIMEOUT_MS=%s from the environment', (raw, config) => {
    expect(providerFromEnv({ JEV_API_KEY: 'k', JEV_TIMEOUT_MS: raw })).toEqual(createProvider(config));
  });
});
