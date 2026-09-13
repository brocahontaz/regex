export interface MatchResult {
  index: number;
  value: string;
  groups: (string | undefined)[];
  namedGroups: Record<string, string>;
}

export type EvalOutcome =
  { ok: true; matches: MatchResult[]; truncated: boolean } | { ok: false; error: string };

export type ReplacementOutcome = { ok: true; result: string } | { ok: false; error: string };

export const DEFAULT_MATCH_LIMIT = 1000;

export interface EvalOptions {
  limit?: number;
}

function toMatchResult(match: RegExpExecArray): MatchResult {
  const groups: (string | undefined)[] = [];
  for (let i = 1; i < match.length; i += 1) {
    groups.push(match[i]);
  }
  const namedGroups: Record<string, string> = {};
  if (match.groups) {
    for (const [name, value] of Object.entries(match.groups)) {
      if (value !== undefined) {
        namedGroups[name] = value;
      }
    }
  }
  return { index: match.index, value: match[0], groups, namedGroups };
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function evaluateRegex(
  pattern: string,
  flags: string,
  text: string,
  options?: EvalOptions,
): EvalOutcome {
  let regex: RegExp;
  try {
    regex = new RegExp(pattern, flags);
  } catch (error) {
    return { ok: false, error: errorMessage(error) };
  }

  const limit = options?.limit ?? DEFAULT_MATCH_LIMIT;
  const matches: MatchResult[] = [];
  let truncated = false;

  if (regex.global || regex.sticky) {
    regex.lastIndex = 0;
    let match = regex.exec(text);
    while (match !== null) {
      matches.push(toMatchResult(match));
      if (match[0].length === 0) {
        // Advance past zero-length matches so the loop cannot spin forever.
        regex.lastIndex += 1;
      }
      if (matches.length >= limit) {
        truncated = regex.exec(text) !== null;
        break;
      }
      match = regex.exec(text);
    }
  } else {
    const match = regex.exec(text);
    if (match !== null) {
      matches.push(toMatchResult(match));
    }
  }

  return { ok: true, matches, truncated };
}

export function applyReplacement(
  pattern: string,
  flags: string,
  text: string,
  replacement: string,
): ReplacementOutcome {
  let regex: RegExp;
  try {
    regex = new RegExp(pattern, flags);
  } catch (error) {
    return { ok: false, error: errorMessage(error) };
  }
  try {
    return { ok: true, result: text.replace(regex, replacement) };
  } catch (error) {
    // e.g. an invalid "$<name>" pattern with the u flag
    return { ok: false, error: errorMessage(error) };
  }
}
