import { noul, score, type GuardPolicy, type NoulCutoffs, type Readout } from './policy.js';

/**
 * Ready-made policies for the common dangerous tool classes. Use directly, or spread
 * and tweak: `{ ...shellPolicy(), escalateBelow: 0.9, perTool: { echo: 'allow' } }`.
 * These are sensible defaults, not a security boundary — see the README.
 *
 * Only shellPolicy sets `escalateBelow`: it is the only preset with a score dimension,
 * and the confidence floor gates score/choice answers only (a noul has no confidence;
 * its probability is compared against the thresholds in `decide` instead).
 */

const RISK_LEVELS = ['none', 'local-reversible', 'local-destructive', 'external-or-irreversible'];
// A missing or non-numeric readout counts as maximum risk, so a policy never reads
// "no answer" as "safe". (decide() also holds on missing answers before this runs.)
const num = (r: Readout | undefined): number =>
  typeof r?.value === 'number' && Number.isFinite(r.value) ? r.value : Number.POSITIVE_INFINITY;

export interface PresetOptions {
  /**
   * replace the preset's built-in noul cut-offs, per dimension and role (see `noulCutoffsFrom`).
   * Anything not given keeps the built-in value.
   */
  cutoffs?: NoulCutoffs;
}

/** The cut-off for one noul dimension in one role, or the preset's built-in value. */
const cutoff =
  (cutoffs: NoulCutoffs = {}) =>
  (id: string, role: 'block' | 'hold', builtIn: number): number =>
    cutoffs[id]?.[role] ?? builtIn;

/** Shell/bash execution — the highest-blast-radius tool class. */
export function shellPolicy(opts: PresetOptions = {}): GuardPolicy {
  const at = cutoff(opts.cutoffs);
  return {
    dimensions: {
      risk: score(RISK_LEVELS, 'Blast radius if this shell command runs unintended'),
      destructive: noul('Does this permanently delete or overwrite data (rm -rf, dd, mkfs, truncating redirects)?'),
      exfiltrates: noul('Does this send data to an external destination (curl/scp/nc to a remote host)?'),
    },
    decide: (r) => {
      if (num(r.destructive) >= at('destructive', 'block', 0.8) && num(r.risk) >= 2) return 'block';
      if (num(r.exfiltrates) >= at('exfiltrates', 'hold', 0.7) || num(r.risk) >= 3) return 'hold';
      return 'allow';
    },
    escalateBelow: 0.7,
  };
}

/** File writes/deletes — guards against clobbering and escaping the workspace. */
export function filesystemPolicy(opts: PresetOptions = {}): GuardPolicy {
  const at = cutoff(opts.cutoffs);
  return {
    dimensions: {
      destructive: noul('Does this delete or overwrite an existing file or directory?'),
      outsideWorkspace: noul(
        'Does this path point outside the project workspace (absolute/system path, or ../ escaping the repo)?',
      ),
    },
    decide: (r) => {
      const destructive = num(r.destructive);
      const outside = num(r.outsideWorkspace);
      if (destructive >= at('destructive', 'block', 0.8) && outside >= at('outsideWorkspace', 'block', 0.5)) {
        return 'block';
      }
      if (destructive >= at('destructive', 'hold', 0.8) || outside >= at('outsideWorkspace', 'hold', 0.8))
        return 'hold';
      return 'allow';
    },
  };
}

/** SQL execution — blocks unscoped mutations (DELETE/UPDATE without WHERE, DROP, TRUNCATE). */
export function sqlPolicy(opts: PresetOptions = {}): GuardPolicy {
  const at = cutoff(opts.cutoffs);
  return {
    dimensions: {
      mutating: noul(
        'Is this a data-mutating or schema-changing statement (INSERT/UPDATE/DELETE/DROP/TRUNCATE/ALTER)?',
      ),
      unscoped: noul('Does a DELETE/UPDATE lack a WHERE clause, or is this a DROP/TRUNCATE affecting a whole table?'),
    },
    decide: (r) => {
      if (num(r.unscoped) >= at('unscoped', 'block', 0.7)) return 'block';
      if (num(r.mutating) >= at('mutating', 'hold', 0.8)) return 'hold';
      return 'allow';
    },
  };
}

/** Money movement — high-stakes: any transfer holds for a human, near-certainty required. */
export function paymentsPolicy(opts: PresetOptions = {}): GuardPolicy {
  const at = cutoff(opts.cutoffs);
  return {
    dimensions: {
      movesMoney: noul('Does this move money or change a financial balance/subscription?'),
      irreversible: noul('Is this transfer hard to reverse (external payout, crypto, wire)?'),
    },
    decide: (r) => (num(r.movesMoney) >= at('movesMoney', 'hold', 0.5) ? 'hold' : 'allow'),
  };
}
