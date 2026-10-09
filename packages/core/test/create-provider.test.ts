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
