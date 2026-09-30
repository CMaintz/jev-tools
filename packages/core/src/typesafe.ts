import type { JevProvider, JevRequest, JevResponse } from './jev-provider.js';
import { postJson } from './http.js';
import { parseJevResponse } from './validate.js';

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
  constructor(
    private readonly apiKey: string,
    private readonly model = 'jev-latest',
    private readonly baseUrl = 'https://api.typesafe.ai/v1',
  ) {}

  async evaluate(req: JevRequest): Promise<JevResponse> {
    const json = await postJson(
      `${this.baseUrl}/systemone`,
      { Authorization: `Bearer ${this.apiKey}` },
      { model: this.model, state: req.state, questions: req.questions },
    );
    return parseJevResponse(json, req.questions);
  }
}
