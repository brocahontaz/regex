import { describe, expect, it } from 'vitest';
import {
  decodeState,
  encodeState,
  estimateUrlLength,
  serializeHash,
  type SharedState,
} from './share';

const full: SharedState = {
  pattern: '(\\w+)@\\w+\\.com',
  flags: 'gim',
  text: 'multi\nline & text = with #hash = ok',
  replacement: '$1 [$&]',
};

function roundTrip(state: SharedState): SharedState | null {
  return decodeState(serializeHash(state));
}

describe('share', () => {
  it('round-trips a full state', () => {
    expect(roundTrip(full)).toEqual(full);
  });

  it('round-trips unicode, newlines and special characters', () => {
    const state: SharedState = {
      pattern: 'π+.*?',
      flags: 'i',
      text: 'emoji 🌍 & <script>alert("x")</script>\n\ta=b#c',
      replacement: '"$&" = $1',
    };
    expect(roundTrip(state)).toEqual(state);
  });

  it('omits empty fields and decodes them back as empty strings', () => {
    const state: SharedState = { pattern: 'a', flags: '', text: '', replacement: '' };
    expect(encodeState(state)).toBe('p=YQ');
    expect(roundTrip(state)).toEqual(state);
  });

  it('produces values that survive & and = in the data', () => {
    const state: SharedState = { pattern: '&=', flags: '', text: 'a&b=c', replacement: '' };
    expect(roundTrip(state)).toEqual(state);
  });

  it('returns null for an empty hash', () => {
    expect(decodeState('')).toBeNull();
    expect(decodeState('#')).toBeNull();
  });

  it('returns null when the pattern param is missing', () => {
    expect(decodeState('#f=Zw%3D%3D'.replace(/%3D/g, ''))).toBeNull();
    expect(decodeState('#f=Zw')).toBeNull();
  });

  it('returns null for malformed base64', () => {
    expect(decodeState('#p=!!!')).toBeNull();
  });

  it('ignores unknown parameters', () => {
    const decoded = decodeState('#p=YQ&zzz=1&x=abc');
    expect(decoded).toEqual({ pattern: 'a', flags: '', text: '', replacement: '' });
  });

  it('accepts a leading "?" or "/" after the hash', () => {
    expect(decodeState('#/p=YQ')).toEqual({ pattern: 'a', flags: '', text: '', replacement: '' });
    expect(decodeState('#?p=YQ')).toEqual({ pattern: 'a', flags: '', text: '', replacement: '' });
  });

  it('serializes with a leading hash', () => {
    const state: SharedState = { pattern: 'a', flags: '', text: '', replacement: '' };
    expect(serializeHash(state)).toBe('#p=YQ');
  });

  it('returns an empty string for an all-empty state', () => {
    const empty: SharedState = { pattern: '', flags: '', text: '', replacement: '' };
    expect(serializeHash(empty)).toBe('');
  });

  it('estimates URL length as base plus serialized hash', () => {
    const state: SharedState = { pattern: 'a', flags: '', text: '', replacement: '' };
    expect(estimateUrlLength('https://example.com/app', state)).toBe(
      'https://example.com/app'.length + serializeHash(state).length,
    );
  });
});
