import { afterEach, describe, expect, it, vi } from 'vitest';
import { CloudflareProvider, providerFromEnv, TypeSafeProvider } from '../src/index.js';

const answers = { model: 'm', answers: {} };
const req = { state: {}, questions: {} };

/** Evaluate once against a stubbed fetch and return the URL and parsed body that were sent. */
async function sentBy(provider: ReturnType<typeof providerFromEnv>) {
  const fetchMock = vi.fn<typeof fetch>(async () => new Response(JSON.stringify(answers)));
  vi.stubGlobal('fetch', fetchMock);
  await provider!.evaluate(req);
  const [url, init] = fetchMock.mock.calls[0]!;
  return { url, body: JSON.parse(init?.body as string) as Record<string, unknown> };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('providerFromEnv fails open', () => {
  it.each([{}, { JEV_API_KEY: '' }, { JEV_PROVIDER: 'cloudflare', CLOUDFLARE_ACCOUNT_ID: 'a' }])(
    'returns null without a key: %j',
    (env) => expect(providerFromEnv(env)).toBeNull(),
  );

  it('returns null for cloudflare without an account id', () => {
    expect(providerFromEnv({ JEV_PROVIDER: 'cloudflare', JEV_API_KEY: 'k' })).toBeNull();
  });
});

describe('providerFromEnv typesafe', () => {
  it('defaults to TypeSafe, jev-latest and the public base URL', async () => {
    const provider = providerFromEnv({ JEV_API_KEY: 'k', JEV_MODEL: '', TYPESAFE_AI_BASE_URL: '' });
    expect(provider).toBeInstanceOf(TypeSafeProvider);
    const { url, body } = await sentBy(provider);
    expect(url).toBe('https://api.typesafe.ai/v1/systemone');
    expect(body.model).toBe('jev-latest');
  });

  it('honours JEV_MODEL and TYPESAFE_AI_BASE_URL', async () => {
    const env = { JEV_API_KEY: 'k', JEV_MODEL: 'jev-2', TYPESAFE_AI_BASE_URL: 'http://localhost:9/v1' };
    const { url, body } = await sentBy(providerFromEnv(env));
    expect(url).toBe('http://localhost:9/v1/systemone');
    expect(body.model).toBe('jev-2');
  });

  it('reads process.env when no env is passed', () => {
    vi.stubEnv('JEV_API_KEY', 'k');
    vi.stubEnv('JEV_PROVIDER', '');
    expect(providerFromEnv()).toBeInstanceOf(TypeSafeProvider);
  });
});

describe('providerFromEnv cloudflare', () => {
  it('builds a Cloudflare provider with the typesafe/jev default model', async () => {
    const provider = providerFromEnv({ JEV_PROVIDER: 'cloudflare', JEV_API_KEY: 't', CLOUDFLARE_ACCOUNT_ID: 'a' });
    expect(provider).toBeInstanceOf(CloudflareProvider);
    const { url, body } = await sentBy(provider);
    expect(url).toBe('https://api.cloudflare.com/client/v4/accounts/a/ai/run');
    expect(body.model).toBe('typesafe/jev');
  });

  it('honours JEV_MODEL', async () => {
    const env = { JEV_PROVIDER: 'cloudflare', JEV_API_KEY: 't', CLOUDFLARE_ACCOUNT_ID: 'a', JEV_MODEL: 'x/y' };
    const { body } = await sentBy(providerFromEnv(env));
    expect(body.model).toBe('x/y');
  });
});
