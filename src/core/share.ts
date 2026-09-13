export interface SharedState {
  pattern: string;
  flags: string;
  text: string;
  replacement: string;
}

function toBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
}

function fromBase64Url(value: string): Uint8Array {
  const base64 = value.replaceAll('-', '+').replaceAll('_', '/');
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function encodeField(value: string): string {
  if (value === '') return '';
  return toBase64Url(new TextEncoder().encode(value));
}

function decodeField(value: string): string {
  if (value === '') return '';
  return new TextDecoder().decode(fromBase64Url(value));
}

export function encodeState(state: SharedState): string {
  const pairs: string[] = [];
  if (state.pattern !== '') pairs.push(`p=${encodeField(state.pattern)}`);
  if (state.flags !== '') pairs.push(`f=${encodeField(state.flags)}`);
  if (state.text !== '') pairs.push(`t=${encodeField(state.text)}`);
  if (state.replacement !== '') pairs.push(`r=${encodeField(state.replacement)}`);
  return pairs.join('&');
}

export function decodeState(hash: string): SharedState | null {
  let rest = hash;
  if (rest.startsWith('#')) rest = rest.slice(1);
  if (rest.startsWith('?') || rest.startsWith('/')) rest = rest.slice(1);
  if (rest === '') return null;

  const state: SharedState = { pattern: '', flags: '', text: '', replacement: '' };
  let sawPattern = false;
  for (const pair of rest.split('&')) {
    const eq = pair.indexOf('=');
    if (eq === -1) continue;
    const key = pair.slice(0, eq);
    const value = pair.slice(eq + 1);
    try {
      if (key === 'p') {
        state.pattern = decodeField(value);
        sawPattern = true;
      } else if (key === 'f') {
        state.flags = decodeField(value);
      } else if (key === 't') {
        state.text = decodeField(value);
      } else if (key === 'r') {
        state.replacement = decodeField(value);
      }
      // Unknown keys are ignored.
    } catch {
      return null;
    }
  }
  return sawPattern ? state : null;
}

export function serializeHash(state: SharedState): string {
  const encoded = encodeState(state);
  return encoded === '' ? '' : `#${encoded}`;
}

export function estimateUrlLength(baseUrl: string, state: SharedState): number {
  return baseUrl.length + serializeHash(state).length;
}
