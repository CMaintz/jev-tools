import { describe, expect, it } from 'vitest';
import { stableStringify } from '../src/index.js';

describe('stableStringify', () => {
  it('is independent of object key order, recursively', () => {
    expect(stableStringify({ b: 1, a: { d: [1, { y: 2, x: 1 }], c: null } })).toBe(
      stableStringify({ a: { c: null, d: [1, { x: 1, y: 2 }] }, b: 1 }),
    );
    expect(stableStringify({ b: 1, a: 2 })).toBe('{"a":2,"b":1}');
  });

  it('keeps array order significant', () => {
    expect(stableStringify([1, 2])).not.toBe(stableStringify([2, 1]));
  });

  it('serializes primitives like JSON.stringify, with undefined as null', () => {
    expect(stableStringify('s')).toBe('"s"');
    expect(stableStringify(3)).toBe('3');
    expect(stableStringify(undefined)).toBe('null');
  });
});
