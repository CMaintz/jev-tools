import type { EvaluateOptions, JevProvider, JevRequest, JevResponse } from './jev-provider.js';
import { DEFAULT_TIMEOUT_MS, postJson } from './http.js';
import { parseJevResponse } from './validate.js';

export interface TypeSafeOptions {
  /** TypeSafe API key. */
  apiKey: string;
  /** model id. Default `jev-latest`. */
  model?: string | undefined;
  /** API base URL (proxy, self-host, mock). Default `https://api.typesafe.ai/v1`. */
  baseUrl?: string | undefined;
  /** per-attempt request timeout in ms. Default 30 000. */
  timeoutMs?: number | undefined;
}

/**
 * TypeSafe first-party adapter.
 *
 * Verified against https://docs.typesafe.ai/api (2026-09):
 *   POST https://api.typesafe.ai/v1/systemone
 *   body:     { model, state, questions }
 *   response: { model, answers, usage }
 *   auth:     Authorization: Bearer {TYPESAFE_API_KEY}
 *
 * The official Python/JS SDKs are the eventual preferred path; this raw adapter keeps the
 * Action dependency-light. `postJson` applies the docs' recommended 429/529 backoff and a timeout;
 * `parseJevResponse` validates the answers against the questions asked.
 */
export class TypeSafeProvider implements JevProvider {
  private readonly apiKey: string;
  private readonly model: string;
  private readonly baseUrl: string;
  private readonly timeoutMs: number;

  constructor(opts: TypeSafeOptions) {
    this.apiKey = opts.apiKey;
    this.model = opts.model ?? 'jev-latest';
    this.baseUrl = opts.baseUrl ?? 'https://api.typesafe.ai/v1';
    this.timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  }

  async evaluate(req: JevRequest, opts: EvaluateOptions = {}): Promise<JevResponse> {
    const json = await postJson(
      `${this.baseUrl}/systemone`,
      { Authorization: `Bearer ${this.apiKey}` },
      { model: this.model, state: req.state, questions: req.questions },
      { timeoutMs: this.timeoutMs, ...opts },
    );
    return parseJevResponse(json, req.questions);
  }
}
