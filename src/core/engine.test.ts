import { describe, expect, it } from 'vitest';
import { DEFAULT_MATCH_LIMIT, evaluateRegex } from './engine';

function expectOk(pattern: string, flags: string, text: string, options?: { limit?: number }) {
  const outcome = evaluateRegex(pattern, flags, text, options);
  expect(outcome.ok).toBe(true);
  if (!outcome.ok) throw new Error(outcome.error);
  return outcome;
}

describe('evaluateRegex', () => {
  it('matches a literal with the correct index and value', () => {
    const { matches } = expectOk('cat', '', 'a cat and another cat');
    expect(matches).toHaveLength(1);
    expect(matches[0].value).toBe('cat');
    expect(matches[0].index).toBe(2);
  });

  it('without the g flag returns only the first match', () => {
    const { matches } = expectOk('cat', '', 'cat cat cat');
    expect(matches).toHaveLength(1);
  });

  it('with the g flag returns all matches', () => {
    const { matches } = expectOk('cat', 'g', 'cat cat cat');
    expect(matches.map((m) => m.index)).toEqual([0, 4, 8]);
  });

  it('supports the i flag', () => {
    const { matches } = expectOk('hello', 'i', 'say HELLO!');
    expect(matches).toHaveLength(1);
    expect(matches[0].value).toBe('HELLO');
  });

  it('supports the m flag for line anchors', () => {
    const { matches } = expectOk('^b', 'gm', 'a\nb\nb');
    expect(matches.map((m) => m.index)).toEqual([2, 4]);
  });

  it('supports the s flag so dot matches newlines', () => {
    expect(expectOk('a.b', '', 'a\nb').matches).toHaveLength(0);
    expect(expectOk('a.b', 's', 'a\nb').matches).toHaveLength(1);
  });

  it('reports numbered capture groups', () => {
    const { matches } = expectOk('(\\w+)@(\\w+)', '', 'bob@site');
    expect(matches[0].groups).toEqual(['bob', 'site']);
  });

  it('reports named capture groups', () => {
    const { matches } = expectOk('(?<user>\\w+)@(?<host>\\w+)', '', 'bob@site');
    expect(matches[0].namedGroups).toEqual({ user: 'bob', host: 'site' });
  });

  it('reports undefined for optional groups that did not participate', () => {
    const { matches } = expectOk('a(b)?c', '', 'ac');
    expect(matches[0].groups).toEqual([undefined]);
  });

  it('handles zero-length matches without hanging and advances correctly', () => {
    const { matches, truncated } = expectOk('a*', 'g', 'bab');
    expect(matches.map((m) => [m.value, m.index])).toEqual([
      ['', 0],
      ['a', 1],
      ['', 2],
      ['', 3],
    ]);
    expect(truncated).toBe(false);
  });

  it('truncates at the limit and reports it', () => {
    const limited = expectOk('a', 'g', 'aaaa', { limit: 2 });
    expect(limited.matches).toHaveLength(2);
    expect(limited.truncated).toBe(true);

    const generous = expectOk('a', 'g', 'aaaa', { limit: 10 });
    expect(generous.matches).toHaveLength(4);
    expect(generous.truncated).toBe(false);
  });

  it('applies the default match limit', () => {
    const { matches, truncated } = expectOk('a', 'g', 'a'.repeat(DEFAULT_MATCH_LIMIT + 5));
    expect(matches).toHaveLength(DEFAULT_MATCH_LIMIT);
    expect(truncated).toBe(true);
  });

  it('returns an error for invalid patterns', () => {
    const outcome = evaluateRegex('(', '', 'abc');
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.error).not.toBe('');
  });

  it('returns an error for invalid flags', () => {
    const outcome = evaluateRegex('a', 'gg', 'aaa');
    expect(outcome.ok).toBe(false);
  });

  it('supports the u flag for unicode escapes and property classes', () => {
    const { matches } = expectOk('\\p{Letter}+', 'gu', 'aπΩ9');
    expect(matches.map((m) => m.value)).toEqual(['aπΩ']);
    // Without the u flag (Annex B), \p{...} is not a property class: no matches here.
    expect(expectOk('\\p{Letter}+', 'g', 'aπΩ').matches).toHaveLength(0);
  });

  it('evaluates lookarounds natively', () => {
    const { matches } = expectOk('\\d+(?= dollars)', 'g', '100 dollars and 50 cents');
    expect(matches.map((m) => m.value)).toEqual(['100']);
  });

  it('evaluates backreferences natively', () => {
    const { matches } = expectOk('(\\w)\\1', 'g', 'hello');
    expect(matches.map((m) => [m.value, m.index])).toEqual([['ll', 2]]);
  });

  it('matches the empty pattern as an empty match everywhere', () => {
    const { matches } = expectOk('', 'g', 'ab');
    expect(matches.map((m) => m.index)).toEqual([0, 1, 2]);
  });
});
