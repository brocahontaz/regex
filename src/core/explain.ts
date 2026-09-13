export type TokenKind =
  | 'literal'
  | 'escape'
  | 'class'
  | 'quantifier'
  | 'anchor'
  | 'group'
  | 'lookaround'
  | 'alternation'
  | 'dot'
  | 'backreference'
  | 'unknown';

export interface ExplainToken {
  raw: string;
  kind: TokenKind;
  title: string;
  detail: string;
  unsupported?: boolean;
  depth?: number;
}

export interface ExplainResult {
  tokens: ExplainToken[];
  warnings: string[];
}

const SPECIAL_CHARS = new Set(['\\', '[', '(', ')', '^', '$', '.', '|', '*', '+', '?', '{']);

const SHORTHAND_CLASSES: Record<string, string> = {
  d: 'Digit (0–9)',
  D: 'Non-digit',
  w: 'Word character (a–z, A–Z, 0–9, _)',
  W: 'Non-word character',
  s: 'Whitespace',
  S: 'Non-whitespace',
};

const CONTROL_ESCAPES: Record<string, string> = {
  n: 'newline',
  t: 'tab',
  r: 'carriage return',
  f: 'form feed',
  v: 'vertical tab',
  '0': 'null character',
};

function hasMatchingParen(pattern: string, openIndex: number): boolean {
  let depth = 0;
  let inClass = false;
  for (let i = openIndex; i < pattern.length; i += 1) {
    const ch = pattern[i];
    if (ch === '\\') {
      i += 1;
      continue;
    }
    if (inClass) {
      if (ch === ']') inClass = false;
      continue;
    }
    if (ch === '[') {
      inClass = true;
    } else if (ch === '(') {
      depth += 1;
    } else if (ch === ')') {
      depth -= 1;
      if (depth === 0) return true;
    }
  }
  return false;
}

export function explainPattern(pattern: string, flags = ''): ExplainResult {
  const tokens: ExplainToken[] = [];
  const warnings: string[] = [];
  const hasUnicodeFlag = flags.includes('u');
  const dotAll = flags.includes('s');
  let depth = 0;
  let i = 0;

  const push = (token: ExplainToken): void => {
    tokens.push({ ...token, depth });
  };

  while (i < pattern.length) {
    const ch = pattern[i];

    if (ch === '\\') {
      const next = pattern[i + 1];
      if (next === undefined) {
        warnings.push('Pattern ends with a lone backslash.');
        push({
          raw: '\\',
          kind: 'unknown',
          title: 'Dangling backslash',
          detail: 'Nothing follows this backslash; the regex engine will report an error.',
          unsupported: true,
        });
        i += 1;
        continue;
      }
      if ((next === 'p' || next === 'P') && pattern[i + 2] === '{') {
        const close = pattern.indexOf('}', i + 3);
        const raw = close === -1 ? pattern.slice(i) : pattern.slice(i, close + 1);
        if (hasUnicodeFlag) {
          push({
            raw,
            kind: 'escape',
            title: next === 'p' ? 'Unicode property' : 'Negated unicode property',
            detail: 'Matches characters with the given unicode property.',
          });
        } else {
          warnings.push('\\p{...} requires the u flag; without it its meaning is unreliable.');
          push({
            raw,
            kind: 'escape',
            title: 'Unicode property (u flag missing)',
            detail: 'Without the u flag this is not a reliable unicode property match.',
            unsupported: true,
          });
        }
        i += raw.length;
        continue;
      }
      if (next === 'k' && pattern[i + 2] === '<') {
        const close = pattern.indexOf('>', i + 3);
        const raw = close === -1 ? pattern.slice(i) : pattern.slice(i, close + 1);
        push({
          raw,
          kind: 'backreference',
          title: 'Named backreference',
          detail: 'Matches the same text as the named group captured earlier.',
        });
        i += raw.length;
        continue;
      }
      if (next >= '1' && next <= '9') {
        let j = i + 1;
        while (j < pattern.length && pattern[j] >= '0' && pattern[j] <= '9') j += 1;
        const raw = pattern.slice(i, j);
        push({
          raw,
          kind: 'backreference',
          title: 'Backreference',
          detail: `Matches the same text captured by group ${raw.slice(1)}.`,
        });
        i = j;
        continue;
      }
      if (next in SHORTHAND_CLASSES) {
        push({
          raw: pattern.slice(i, i + 2),
          kind: 'escape',
          title: SHORTHAND_CLASSES[next],
          detail: 'Shorthand character class.',
        });
        i += 2;
        continue;
      }
      if (next === 'b' || next === 'B') {
        push({
          raw: pattern.slice(i, i + 2),
          kind: 'anchor',
          title: next === 'b' ? 'Word boundary' : 'Non-word boundary',
          detail: 'Zero-width position at (or not at) a word boundary.',
        });
        i += 2;
        continue;
      }
      if (next in CONTROL_ESCAPES) {
        push({
          raw: pattern.slice(i, i + 2),
          kind: 'escape',
          title: `Escaped ${CONTROL_ESCAPES[next]}`,
          detail: 'Matches the corresponding character.',
        });
        i += 2;
        continue;
      }
      if (next === 'x') {
        push({
          raw: pattern.slice(i, i + 2),
          kind: 'escape',
          title: 'Hex escape (\\xHH)',
          detail: 'Matches the character with the given two-digit hex code.',
        });
        i += 2;
        continue;
      }
      if (next === 'u') {
        if (pattern[i + 2] === '{') {
          const close = pattern.indexOf('}', i + 3);
          const raw = close === -1 ? pattern.slice(i) : pattern.slice(i, close + 1);
          if (hasUnicodeFlag) {
            push({
              raw,
              kind: 'escape',
              title: 'Unicode code point escape',
              detail: 'Matches the character at the given code point.',
            });
          } else {
            warnings.push(
              '\\u{...} requires the u flag; without it it is not a code point escape.',
            );
            push({
              raw,
              kind: 'escape',
              title: 'Unicode code point escape (u flag missing)',
              detail: 'Without the u flag this is treated literally by the engine.',
              unsupported: true,
            });
          }
          i += raw.length;
        } else {
          push({
            raw: pattern.slice(i, i + 2),
            kind: 'escape',
            title: 'Unicode escape (\\uHHHH)',
            detail: 'Matches the character with the given four-digit hex code.',
          });
          i += 2;
        }
        continue;
      }
      if (next === '\\') {
        push({
          raw: pattern.slice(i, i + 2),
          kind: 'escape',
          title: 'Escaped backslash',
          detail: 'Matches a literal backslash.',
        });
        i += 2;
        continue;
      }
      if (/[A-Za-z0-9]/.test(next)) {
        push({
          raw: pattern.slice(i, i + 2),
          kind: 'unknown',
          title: 'Unrecognized escape',
          detail:
            'Not recognized by this explainer; the engine may treat it as the literal character (invalid with the u flag).',
        });
        i += 2;
        continue;
      }
      push({
        raw: pattern.slice(i, i + 2),
        kind: 'escape',
        title: `Escaped “${next}”`,
        detail: `Matches the literal character “${next}”.`,
      });
      i += 2;
      continue;
    }

    if (ch === '[') {
      let j = i + 1;
      if (pattern[j] === '^') j += 1;
      let closed = false;
      while (j < pattern.length) {
        if (pattern[j] === '\\') {
          j += 2;
          continue;
        }
        if (pattern[j] === ']') {
          closed = true;
          j += 1;
          break;
        }
        j += 1;
      }
      if (!closed) {
        warnings.push('Character class is missing its closing "]".');
        push({
          raw: pattern.slice(i),
          kind: 'class',
          title: 'Unterminated character class',
          detail: 'This class never closes; the engine will report an error.',
          unsupported: true,
        });
        i = pattern.length;
      } else {
        const raw = pattern.slice(i, j);
        const negated = raw.startsWith('[^');
        const hasRange = /[^\\]-[^\\\]]/.test(raw.slice(1, -1));
        push({
          raw,
          kind: 'class',
          title: negated ? 'Negated character class' : 'Character class',
          detail:
            (negated
              ? 'Matches any character NOT in this set.'
              : 'Matches any character in this set.') + (hasRange ? ' Contains a range.' : ''),
        });
        i = j;
      }
      continue;
    }

    if (ch === '(') {
      let prefix = '(';
      let kind: TokenKind = 'group';
      let title = 'Capturing group';
      let detail = 'Captures the matched text for backreferences or replacement ($1, $2, ...).';
      let unsupported = false;
      if (pattern.startsWith('(?:', i)) {
        prefix = '(?:';
        title = 'Non-capturing group';
        detail = 'Groups the pattern without capturing.';
      } else if (pattern.startsWith('(?=', i)) {
        prefix = '(?=';
        kind = 'lookaround';
        title = 'Positive lookahead';
        detail =
          'Matches only if what follows matches the pattern inside — without consuming text.';
      } else if (pattern.startsWith('(?!', i)) {
        prefix = '(?!';
        kind = 'lookaround';
        title = 'Negative lookahead';
        detail =
          'Matches only if what follows does NOT match the pattern inside — without consuming text.';
      } else if (pattern.startsWith('(?<=', i)) {
        prefix = '(?<=';
        kind = 'lookaround';
        title = 'Positive lookbehind';
        detail =
          'Matches only if what precedes matches the pattern inside — without consuming text.';
      } else if (pattern.startsWith('(?<!', i)) {
        prefix = '(?<!';
        kind = 'lookaround';
        title = 'Negative lookbehind';
        detail =
          'Matches only if what precedes does NOT match the pattern inside — without consuming text.';
      } else if (pattern.startsWith('(?<', i)) {
        const nameMatch = /^\(\?<([A-Za-z_$][A-Za-z0-9_$]*)>/.exec(pattern.slice(i));
        if (nameMatch) {
          prefix = nameMatch[0];
          title = `Named group “${nameMatch[1]}”`;
          detail = 'Captures the matched text under this name (usable as $<name> or \\k<name>).';
        } else {
          prefix = pattern.slice(i, i + 3);
          kind = 'unknown';
          title = 'Unrecognized group syntax';
          detail = 'This does not look like a valid named group.';
          unsupported = true;
        }
      } else if (pattern.startsWith('(?', i)) {
        prefix = pattern.slice(i, i + 2);
        kind = 'unknown';
        title = 'Unrecognized group syntax';
        detail = 'This explainer does not know this construct; the engine may report an error.';
        unsupported = true;
      }
      push({ raw: prefix, kind, title, detail, unsupported: unsupported || undefined });
      if (!hasMatchingParen(pattern, i)) {
        warnings.push('Group is missing its closing ")".');
      }
      depth += 1;
      i += prefix.length;
      continue;
    }

    if (ch === ')') {
      depth = Math.max(0, depth - 1);
      push({
        raw: ')',
        kind: 'group',
        title: 'End of group',
        detail: 'Closes the innermost group.',
      });
      i += 1;
      continue;
    }

    if (ch === '^' || ch === '$') {
      push({
        raw: ch,
        kind: 'anchor',
        title: ch === '^' ? 'Start of string/line' : 'End of string/line',
        detail:
          ch === '^'
            ? flags.includes('m')
              ? 'With the m flag: matches at the start of any line.'
              : 'Matches at the start of the string.'
            : flags.includes('m')
              ? 'With the m flag: matches at the end of any line.'
              : 'Matches at the end of the string.',
      });
      i += 1;
      continue;
    }

    if (ch === '.') {
      push({
        raw: '.',
        kind: 'dot',
        title: 'Any character',
        detail: dotAll
          ? 'With the s flag: matches newlines too.'
          : 'Matches any character except newlines.',
      });
      i += 1;
      continue;
    }

    if (ch === '|') {
      push({
        raw: '|',
        kind: 'alternation',
        title: 'Alternation',
        detail: 'Either the expression before or after this pipe can match.',
      });
      i += 1;
      continue;
    }

    if (ch === '*' || ch === '+' || ch === '?') {
      let raw = ch;
      i += 1;
      if (pattern[i] === '?') {
        raw += '?';
        i += 1;
      }
      push({
        raw,
        kind: 'quantifier',
        title: raw === '?' ? 'Optional (0 or 1)' : raw === '+' ? 'One or more' : 'Zero or more',
        detail:
          (raw.endsWith('?')
            ? 'Lazy: matches as few as possible. '
            : 'Greedy: matches as many as possible. ') + 'Applies to the previous element.',
      });
      continue;
    }

    if (ch === '{') {
      const quantifier = /^\{(\d+)(,(\d+)?)?\}/.exec(pattern.slice(i));
      if (quantifier) {
        let raw = quantifier[0];
        i += raw.length;
        let lazy = false;
        if (pattern[i] === '?') {
          raw += '?';
          lazy = true;
          i += 1;
        }
        const [, min, comma, max] = quantifier;
        const title =
          comma === undefined
            ? `Repeat exactly ${min} times`
            : max === undefined
              ? `Repeat ${min}+ times`
              : `Repeat ${min} to ${max} times`;
        push({
          raw,
          kind: 'quantifier',
          title,
          detail:
            (lazy ? 'Lazy: as few as possible. ' : 'Greedy: as many as possible. ') +
            'Applies to the previous element.',
        });
      } else {
        push({
          raw: '{',
          kind: 'literal',
          title: 'Literal “{”',
          detail: 'Not a valid quantifier, so this matches the character “{”.',
        });
        i += 1;
      }
      continue;
    }

    // Literal run: consume consecutive plain characters as one token.
    let j = i;
    while (
      j < pattern.length &&
      !SPECIAL_CHARS.has(pattern[j]) &&
      pattern[j] !== ']' &&
      pattern[j] !== '}'
    ) {
      j += 1;
    }
    if (j === i) j = i + 1;
    const raw = pattern.slice(i, j);
    push({
      raw,
      kind: 'literal',
      title: 'Literal text',
      detail: `Matches the text “${raw}” exactly.`,
    });
    i = j;
  }

  return { tokens, warnings };
}
