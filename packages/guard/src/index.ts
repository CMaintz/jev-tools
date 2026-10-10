// Public API.
export { guard } from './guard.js';
export type { GuardResult, GuardOptions } from './guard.js';

export { enforce, GuardBlockedError } from './enforce.js';
export type { EnforceOptions } from './enforce.js';

export { wrapTool } from './adapters/wrap-tool.js';
export type { WrapToolOptions } from './adapters/wrap-tool.js';

export { createCache, keyOf } from './cache.js';
export type { GuardCache } from './cache.js';

export { score, noul, choice } from './policy.js';
export type { ToolCall, Verdict, Dimension, Readout, GuardPolicy } from './policy.js';

export { shellPolicy, filesystemPolicy, sqlPolicy, paymentsPolicy } from './presets.js';

export type { Decision } from './core/decide.js';

export { escalateBelowFrom } from './core/thresholds.js';
export type { EscalateBelowFromThresholds, Gate, ThresholdsFile, ThresholdsProvenance } from './core/thresholds.js';

// Shared provider port, re-exported from @cmaintz/jev-core.
export { TypeSafeProvider, CloudflareProvider } from '@cmaintz/jev-core';
export type { JevProvider } from '@cmaintz/jev-core';
