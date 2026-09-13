import { describe, expect, it } from 'vitest';
import { explainPattern } from './explain';

describe('explainPattern', () => {
  it('explains literal runs as a single token', () => {
    const { tokens, warnings } = explainPattern('abc');
    expect(warnings).toEqual([]);
    expect(tokens).toHaveLength(1);
    expect(tokens[0]).toMatchObject({ raw: 'abc', kind: 'literal' });
  });

  it('explains shorthand escapes', () => {
    const { tokens } = explainPattern('\\d');
    expect(tokens[0]).toMatchObject({ raw: '\\d', kind: 'escape', title: 'Digit (0–9)' });
  });

  it('explains character classes and negated classes', () => {
    const { tokens } = explainPattern('[a-z]');
    expect(tokens[0]).toMatchObject({ raw: '[a-z]', kind: 'class' });
    expect(tokens[0].title).not.toContain('Negated');

    const negated = explainPattern('[^x]').tokens[0];
    expect(negated.raw).toBe('[^x]');
    expect(negated.title).toContain('Negated');
  });

  it('explains bounded and lazy quantifiers', () => {
    const { tokens } = explainPattern('a{2,4}');
    expect(tokens[1]).toMatchObject({ raw: '{2,4}', kind: 'quantifier' });
    expect(tokens[1].title).toContain('2 to 4');

    const lazy = explainPattern('a*?').tokens[1];
    expect(lazy.raw).toBe('*?');
    expect(lazy.detail).toContain('Lazy');
  });

  it('explains anchors', () => {
    const kinds = explainPattern('^a\\b$').tokens.map((t) => t.kind);
    expect(kinds).toEqual(['anchor', 'literal', 'anchor', 'anchor']);
  });

  it('explains capturing, non-capturing and named groups', () => {
    expect(explainPattern('(x)').tokens[0]).toMatchObject({
      raw: '(',
      kind: 'group',
      title: 'Capturing group',
    });
    expect(explainPattern('(?:x)').tokens[0]).toMatchObject({
      raw: '(?:',
      title: 'Non-capturing group',
    });
    expect(explainPattern('(?<year>\\d{4})').tokens[0]).toMatchObject({
      raw: '(?<year>',
      title: 'Named group “year”',
    });
  });

  it('nests tokens inside groups by depth', () => {
    const { tokens } = explainPattern('(?<year>\\d{4})');
    const digit = tokens.find((t) => t.raw === '\\d');
    expect(digit?.depth).toBe(1);
    const close = tokens.find((t) => t.raw === ')');
    expect(close?.depth).toBe(0);
  });

  it('explains alternation', () => {
    const { tokens } = explainPattern('a|b');
    expect(tokens.map((t) => t.kind)).toEqual(['literal', 'alternation', 'literal']);
  });

  it('explains the dot and notes the s flag', () => {
    const withoutS = explainPattern('.').tokens[0];
    expect(withoutS).toMatchObject({ kind: 'dot' });
    expect(withoutS.detail).not.toContain('s flag');

    const withS = explainPattern('.', 's').tokens[0];
    expect(withS.detail).toContain('s flag');
  });

  it('explains backreferences', () => {
    // tokens: "(" open, "a" literal, ")" close, "\1" backreference
    expect(explainPattern('(a)\\1').tokens[3]).toMatchObject({
      raw: '\\1',
      kind: 'backreference',
    });
    expect(explainPattern('(?<x>a)\\k<x>').tokens[3]).toMatchObject({
      kind: 'backreference',
    });
  });

  it('explains lookarounds', () => {
    expect(explainPattern('(?=a)').tokens[0]).toMatchObject({
      raw: '(?=',
      kind: 'lookaround',
      title: 'Positive lookahead',
    });
    expect(explainPattern('(?<=a)').tokens[0]).toMatchObject({
      title: 'Positive lookbehind',
    });
    expect(explainPattern('(?!a)').tokens[0]).toMatchObject({ title: 'Negative lookahead' });
    expect(explainPattern('(?<!a)').tokens[0]).toMatchObject({ title: 'Negative lookbehind' });
  });

  it('flags unicode property escapes without the u flag as unsupported', () => {
    const withoutU = explainPattern('\\p{L}').tokens[0];
    expect(withoutU.unsupported).toBe(true);

    const withU = explainPattern('\\p{L}', 'u').tokens[0];
    expect(withU.unsupported).toBeUndefined();
  });

  it('flags \\u{...} without the u flag as unsupported', () => {
    expect(explainPattern('\\u{1F600}').tokens[0].unsupported).toBe(true);
    expect(explainPattern('\\u{1F600}', 'u').tokens[0].unsupported).toBeUndefined();
  });

  it('warns about an unterminated character class without throwing', () => {
    const { tokens, warnings } = explainPattern('ab[cd');
    expect(warnings).toHaveLength(1);
    expect(tokens.some((t) => t.unsupported)).toBe(true);
  });

  it('warns about an unterminated group without throwing', () => {
    const { warnings } = explainPattern('(ab');
    expect(warnings).toHaveLength(1);
  });

  it('warns about a dangling backslash', () => {
    const { warnings } = explainPattern('ab\\');
    expect(warnings).toHaveLength(1);
  });

  it('marks unrecognized group syntax honestly', () => {
    const { tokens } = explainPattern('(?P<name>x)');
    expect(tokens[0]).toMatchObject({ kind: 'unknown', unsupported: true });
  });

  it('is deterministic', () => {
    const a = explainPattern('a(b|c)*d\\k<x>?');
    const b = explainPattern('a(b|c)*d\\k<x>?');
    expect(a).toEqual(b);
  });
});
