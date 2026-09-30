import { describe, expect, it } from 'vitest';
import { HELP, parseCliArgs } from '../src/args.js';

const opts = (argv: string[]) => {
  const parsed = parseCliArgs(argv);
  if (parsed.help) throw new Error('unexpected help');
  return parsed.options;
};

describe('parseCliArgs', () => {
  it('returns help for -h / --help', () => {
    expect(parseCliArgs(['--help'])).toEqual({ help: true });
    expect(parseCliArgs(['-h', '-q', 'x:noul'])).toEqual({ help: true });
    expect(HELP).toContain('--reject-out');
  });

  it('parses the full option set', () => {
    expect(
      opts([
        '-q',
        'team:choice(a,b)',
        '-q',
        'urgent:noul',
        '--config',
        'c.yml',
        '--escalate',
        'conf<0.6',
        '--review-out',
        'r.jsonl',
        '--reject-out',
        'x.jsonl',
        '--format',
        'csv',
        '--provider',
        'cloudflare',
        '--model',
        'jev-1.13.0',
        '--concurrency',
        '4',
        '--rate',
        '600',
        '--dedupe',
        '--eval',
        'l.jsonl',
        '--allow-review',
      ]),
    ).toEqual({
      questions: ['team:choice(a,b)', 'urgent:noul'],
      config: 'c.yml',
      escalate: 'conf<0.6',
      reviewOut: 'r.jsonl',
      rejectOut: 'x.jsonl',
      format: 'csv',
      provider: 'cloudflare',
      model: 'jev-1.13.0',
      concurrency: 4,
      rate: 600,
      dedupe: true,
      eval: 'l.jsonl',
      allowReview: true,
    });
  });

  it('leaves optional values unset by default', () => {
    expect(opts([])).toEqual({ questions: [], dedupe: false, allowReview: false });
  });

  it('accepts a fractional --rate', () => {
    expect(opts(['--rate', '0.5']).rate).toBe(0.5);
  });

  it.each([['0'], ['-2'], ['1.5'], ['abc'], ['']])('rejects --concurrency %j', (v) => {
    expect(() => parseCliArgs([`--concurrency=${v}`])).toThrow('--concurrency must be a positive integer');
  });

  it.each([['0'], ['-1'], ['fast'], ['Infinity']])('rejects --rate %j', (v) => {
    expect(() => parseCliArgs([`--rate=${v}`])).toThrow('--rate must be a positive number');
  });

  it('rejects unknown --format / --provider values', () => {
    expect(() => parseCliArgs(['--format', 'xml'])).toThrow('--format must be one of jsonl, csv');
    expect(() => parseCliArgs(['--provider', 'openai'])).toThrow('--provider must be one of typesafe, cloudflare');
  });

  it('rejects unknown flags', () => {
    expect(() => parseCliArgs(['--nope'])).toThrow();
  });
});
