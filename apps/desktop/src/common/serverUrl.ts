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
    const protocol = parsed.protocol.toLowerCase();
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

/** True if both URLs refer to the same server once normalized. Two blank/unset URLs never match. */
export function serverUrlsMatch(a: string | null | undefined, b: string | null | undefined): boolean {
  const normalizedA = normalizeServerUrlForCompare(a);
  const normalizedB = normalizeServerUrlForCompare(b);
  return normalizedA.length > 0 && normalizedA === normalizedB;
}
