/**
 * Shared server-URL comparison helper used by both the main process
 * (connection-history de-duplication) and the renderer (filtering the save
 * list to the currently entered/connected server). Kept here -- rather than
 * duplicated -- since `src/common/**` is the one folder included by every
 * one of the desktop app's separate TypeScript projects.
 */

/**
 * Normalizes a server URL for equality comparisons: trims whitespace,
 * lowercases the scheme + host (case-insensitive per the URL spec, unlike
 * path/query), and strips a single trailing slash from the path. Returns an
 * empty string for blank input so callers can treat that as "no URL".
 */
export function normalizeServerUrlForCompare(url: string | null | undefined): string {
  if (!url) return '';
  const trimmed = url.trim();
  if (!trimmed) return '';
  try {
    const parsed = new URL(trimmed);
    const protocol = toWebSocketProtocol(parsed.protocol);
    const host = parsed.host.toLowerCase();
    const pathname = parsed.pathname.replace(/\/+$/, '');
    return `${protocol}//${host}${pathname}${parsed.search}`;
  } catch {
    // Not a parseable absolute URL -- fall back to a plain
    // trim + lowercase + trailing-slash-strip comparison rather than
    // rejecting it outright.
    return trimmed.toLowerCase().replace(/\/+$/, '');
  }
}

export function normalizeServerUrlForConnection(serverUrl: string): string {
  let url: URL;
  try {
    url = new URL(serverUrl.trim());
  } catch {
    throw new Error('Server address must be an absolute URL using http://, https://, ws://, or wss://.');
  }

  url.protocol = toWebSocketProtocol(url.protocol);
  if (url.protocol !== 'ws:' && url.protocol !== 'wss:') {
    throw new Error('Server address must use http://, https://, ws://, or wss://.');
  }
  if (url.protocol === 'ws:' && !isLoopbackHost(url.hostname)) {
    throw new Error('Remote lobby servers must use wss:// to protect Discord sessions.');
  }
  return url.toString();
}

/** True if both URLs refer to the same server once normalized. Two blank/unset URLs never match. */
export function serverUrlsMatch(a: string | null | undefined, b: string | null | undefined): boolean {
  const normalizedA = normalizeServerUrlForCompare(a);
  const normalizedB = normalizeServerUrlForCompare(b);
  return normalizedA.length > 0 && normalizedA === normalizedB;
}

function toWebSocketProtocol(protocol: string): string {
  switch (protocol.toLowerCase()) {
    case 'http:':
      return 'ws:';
    case 'https:':
      return 'wss:';
    default:
      return protocol.toLowerCase();
  }
}

function isLoopbackHost(hostname: string): boolean {
  return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]';
}
