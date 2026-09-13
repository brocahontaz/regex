import { describe, expect, it } from 'vitest';
import { applyReplacement } from './engine';

function expectOk(pattern: string, flags: string, text: string, replacement: string) {
  const outcome = applyReplacement(pattern, flags, text, replacement);
  expect(outcome.ok).toBe(true);
  if (!outcome.ok) throw new Error(outcome.error);
  return outcome;
}

describe('applyReplacement', () => {
  it('substitutes numbered groups with $1, $2', () => {
    const { result } = expectOk(
      '(\\w+)@(\\w+)\\.com',
      'g',
      'mail bob@example.com now',
      '$1 [at] $2',
    );
    expect(result).toBe('mail bob [at] example now');
  });

  it('substitutes named groups with $<name>', () => {
    const { result } = expectOk('(?<first>\\w+) (\\w+)', 'g', 'John Smith', '$<first>, $2');
    expect(result).toBe('John, Smith');
  });

  it('supports $& for the whole match', () => {
    const { result } = expectOk('\\w+', 'g', 'foo bar', '$&!');
    expect(result).toBe('foo! bar!');
  });

  it('supports $$ as a literal dollar sign', () => {
    const { result } = expectOk('a', '', 'a', '$$');
    expect(result).toBe('$');
  });

  it('replaces only the first match without the g flag', () => {
    const { result } = expectOk('a', '', 'aaa', 'b');
    expect(result).toBe('baa');
  });

  it('replaces all matches with the g flag', () => {
    const { result } = expectOk('a', 'g', 'aaa', 'b');
    expect(result).toBe('bbb');
  });

  it('treats unknown group references literally', () => {
    const { result } = expectOk('x', 'g', 'x y', '$9');
    expect(result).toBe('$9 y');
  });

  it('returns an error for invalid patterns', () => {
    const outcome = applyReplacement('(', '', 'abc', 'x');
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.error).not.toBe('');
  });

  it('treats a reference to a nonexistent named group literally (V8 semantics)', () => {
    const { result } = expectOk('a', 'u', 'a', '$<foo>');
    expect(result).toBe('$<foo>');
  });
});
