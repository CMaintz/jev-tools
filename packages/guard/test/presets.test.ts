import { describe, expect, it } from 'vitest';
import { filesystemPolicy, paymentsPolicy, shellPolicy, sqlPolicy } from '../src/presets.js';
import type { Readout } from '../src/policy.js';

const ro = (value: number): Readout => ({ value, confidence: 1, raw: { type: 'noul', noul: value } });
const str = (value: string): Readout => ({
  value,
  confidence: 1,
  raw: { type: 'choice', choice: value, confidence: 1, probabilities: {} },
});

describe('presets', () => {
  it('no preset reads an empty readout set as allow', () => {
    for (const p of [shellPolicy(), filesystemPolicy(), sqlPolicy(), paymentsPolicy()]) {
      expect(p.decide({})).not.toBe('allow');
    }
  });

  it('only sets escalateBelow where a score/choice dimension can use it', () => {
    for (const p of [shellPolicy(), filesystemPolicy(), sqlPolicy(), paymentsPolicy()]) {
      const gated = Object.values(p.dimensions).some((d) => d.kind !== 'noul');
      expect(p.escalateBelow !== undefined).toBe(gated);
    }
  });

  it('shellPolicy: block destructive+risky, hold exfiltration or high risk, else allow', () => {
    const p = shellPolicy();
    expect(p.decide({ risk: ro(3), destructive: ro(0.9), exfiltrates: ro(0) })).toBe('block');
    expect(p.decide({ risk: ro(1), destructive: ro(0.1), exfiltrates: ro(0.9) })).toBe('hold');
    expect(p.decide({ risk: ro(3), destructive: ro(0.1), exfiltrates: ro(0.1) })).toBe('hold');
    expect(p.decide({ risk: ro(0), destructive: ro(0.1), exfiltrates: ro(0.1) })).toBe('allow');
    // a non-numeric or missing readout reads as maximum risk, never as safe
    expect(p.decide({ risk: str('none'), destructive: ro(0.1), exfiltrates: ro(0.1) })).toBe('hold');
    expect(p.decide({ destructive: ro(0.1), exfiltrates: ro(0.1) })).toBe('hold');
    expect(p.decide({ risk: ro(3) })).toBe('block');
  });

  it('filesystemPolicy: block destructive+outside, hold destructive OR outside, else allow', () => {
    const p = filesystemPolicy();
    expect(p.decide({ destructive: ro(0.9), outsideWorkspace: ro(0.9) })).toBe('block');
    expect(p.decide({ destructive: ro(0.9), outsideWorkspace: ro(0.1) })).toBe('hold');
    expect(p.decide({ destructive: ro(0.1), outsideWorkspace: ro(0.9) })).toBe('hold');
    expect(p.decide({ destructive: ro(0.1), outsideWorkspace: ro(0.1) })).toBe('allow');
  });

  it('sqlPolicy: block unscoped, hold mutating, allow reads', () => {
    const p = sqlPolicy();
    expect(p.decide({ mutating: ro(1), unscoped: ro(0.9) })).toBe('block');
    expect(p.decide({ mutating: ro(0.9), unscoped: ro(0.1) })).toBe('hold');
    expect(p.decide({ mutating: ro(0.1), unscoped: ro(0) })).toBe('allow');
  });

  it('paymentsPolicy: hold any money movement, else allow', () => {
    const p = paymentsPolicy();
    expect(p.decide({ movesMoney: ro(0.6), irreversible: ro(0.9) })).toBe('hold');
    expect(p.decide({ movesMoney: ro(0.1), irreversible: ro(0) })).toBe('allow');
  });

  it('cutoffs override only the given dimension and role', () => {
    const fs = filesystemPolicy({ cutoffs: { outsideWorkspace: { block: 0.9 } } });
    expect(fs.decide({ destructive: ro(0.9), outsideWorkspace: ro(0.6) })).toBe('hold');
    expect(fs.decide({ destructive: ro(0.9), outsideWorkspace: ro(0.95) })).toBe('block');
    expect(fs.decide({ destructive: ro(0.1), outsideWorkspace: ro(0.85) })).toBe('hold');

    const fsHold = filesystemPolicy({ cutoffs: { destructive: { hold: 0.5 } } });
    expect(fsHold.decide({ destructive: ro(0.6), outsideWorkspace: ro(0.1) })).toBe('hold');

    const sql = sqlPolicy({ cutoffs: { unscoped: { block: 0.95 }, mutating: { hold: 0.5 } } });
    expect(sql.decide({ mutating: ro(0.6), unscoped: ro(0.9) })).toBe('hold');
    expect(sql.decide({ mutating: ro(0.4), unscoped: ro(0.1) })).toBe('allow');

    const shell = shellPolicy({ cutoffs: { exfiltrates: { hold: 0.95 } } });
    expect(shell.decide({ risk: ro(1), destructive: ro(0.1), exfiltrates: ro(0.9) })).toBe('allow');

    const pay = paymentsPolicy({ cutoffs: { movesMoney: { hold: 0.9 } } });
    expect(pay.decide({ movesMoney: ro(0.6), irreversible: ro(0) })).toBe('allow');
  });
});
