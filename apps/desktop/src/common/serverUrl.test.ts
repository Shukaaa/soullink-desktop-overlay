import { describe, expect, it } from 'vitest';
import { normalizeServerUrlForCompare, serverUrlsMatch } from './serverUrl';

describe('normalizeServerUrlForCompare', () => {
  it('returns an empty string for blank/nullish input', () => {
    expect(normalizeServerUrlForCompare(null)).toBe('');
    expect(normalizeServerUrlForCompare(undefined)).toBe('');
    expect(normalizeServerUrlForCompare('')).toBe('');
    expect(normalizeServerUrlForCompare('   ')).toBe('');
  });

  it('trims whitespace', () => {
    expect(normalizeServerUrlForCompare('  ws://localhost:8787  ')).toBe(
      normalizeServerUrlForCompare('ws://localhost:8787')
    );
  });

  it('strips a trailing slash', () => {
    expect(normalizeServerUrlForCompare('ws://localhost:8787/')).toBe(
      normalizeServerUrlForCompare('ws://localhost:8787')
    );
  });

  it('lowercases protocol and host but not path/query', () => {
    expect(normalizeServerUrlForCompare('WS://LOCALHOST:8787')).toBe(
      normalizeServerUrlForCompare('ws://localhost:8787')
    );
    expect(normalizeServerUrlForCompare('ws://Example.com/Path')).toBe('ws://example.com/Path');
  });

  it('falls back to a plain comparison for non-parseable input', () => {
    expect(normalizeServerUrlForCompare('  NotAUrl/  ')).toBe('notaurl');
  });
});

describe('serverUrlsMatch', () => {
  it('matches equivalent URLs that differ only in whitespace/case/trailing slash', () => {
    expect(serverUrlsMatch('ws://localhost:8787', ' WS://LocalHost:8787/ ')).toBe(true);
  });

  it('does not match different hosts/ports', () => {
    expect(serverUrlsMatch('ws://localhost:8787', 'ws://localhost:9999')).toBe(false);
    expect(serverUrlsMatch('ws://localhost:8787', 'ws://otherhost:8787')).toBe(false);
  });

  it('never matches when either side is blank/nullish', () => {
    expect(serverUrlsMatch(null, null)).toBe(false);
    expect(serverUrlsMatch('', '')).toBe(false);
    expect(serverUrlsMatch('ws://localhost:8787', null)).toBe(false);
    expect(serverUrlsMatch(null, 'ws://localhost:8787')).toBe(false);
  });
});
