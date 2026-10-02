import { z } from 'zod';
import { MAX_NAME_LENGTH } from '@soullink/shared';
import { normalizeServerUrlForConnection } from '../common/serverUrl';

const startResponseSchema = z.object({
  flowId: z.string().min(1),
  authorizeUrl: z.string().url(),
});
const completeResponseSchema = z.object({
  status: z.literal('complete'),
  token: z.string().min(32),
  user: z.object({
    id: z.string().min(1),
    username: z.string().min(1).max(MAX_NAME_LENGTH),
  }),
});

export interface DiscordLoginResult {
  token: string;
  userId: string;
  username: string;
}

export async function loginWithDiscord(
  serverUrl: string,
  openExternal: (url: string) => Promise<void>,
  signal: AbortSignal
): Promise<DiscordLoginResult> {
  const baseUrl = serverHttpBase(serverUrl);
  const startResponse = await fetchServer(
    new URL('/auth/discord/start', baseUrl),
    { method: 'POST', signal },
    'starting Discord login'
  );
  const startPayload = await responseJson(startResponse);
  const start = startResponseSchema.parse(startPayload);
  const authorizeUrl = new URL(start.authorizeUrl);
  if (authorizeUrl.origin !== 'https://discord.com') {
    throw new Error('The server returned an invalid Discord login address.');
  }
  await openExternal(authorizeUrl.toString());

  const deadline = Date.now() + 5 * 60_000;
  while (Date.now() < deadline) {
    await delay(750, signal);
    const pollResponse = await fetchServer(
      new URL('/auth/discord/poll', baseUrl),
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ flowId: start.flowId }),
        signal,
      },
      'checking Discord login'
    );
    if (pollResponse.status === 202) continue;
    const result = completeResponseSchema.parse(await responseJson(pollResponse));
    return { token: result.token, userId: result.user.id, username: result.user.username };
  }
  throw new Error('Discord login timed out. Please try again.');
}

async function fetchServer(url: URL, init: RequestInit, operation: string): Promise<Response> {
  try {
    return await fetch(url, init);
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') throw error;
    const code = getNetworkErrorCode(error);
    const detail = code ? ` (${code})` : '';
    throw new Error(
      `Could not reach the SoulLink server while ${operation}${detail}. Check the server address, network connection, and HTTPS certificate.`
    );
  }
}

function getNetworkErrorCode(error: unknown): string | null {
  if (!(error instanceof Error)) return null;
  const cause = error.cause;
  if (typeof cause !== 'object' || cause === null || !('code' in cause)) return null;
  return typeof cause.code === 'string' ? cause.code : null;
}

async function responseJson(response: Response): Promise<unknown> {
  const body = await response.text();
  if (!body.trim()) {
    throw new Error(
      `The SoulLink server returned an empty response (HTTP ${response.status}). Check the server URL and deploy the server version with Discord OAuth support.`
    );
  }

  let payload: unknown;
  try {
    payload = JSON.parse(body) as unknown;
  } catch {
    throw new Error(
      `The SoulLink server returned a non-JSON response (HTTP ${response.status}). Check the server URL and deploy the server version with Discord OAuth support.`
    );
  }
  if (!response.ok) {
    const message =
      typeof payload === 'object' && payload !== null && 'error' in payload && typeof payload.error === 'string'
        ? payload.error
        : `Server returned HTTP ${response.status}.`;
    throw new Error(message);
  }
  return payload;
}

function serverHttpBase(serverUrl: string): URL {
  const base = new URL(normalizeServerUrlForConnection(serverUrl));
  if (base.protocol === 'ws:') base.protocol = 'http:';
  if (base.protocol === 'wss:') base.protocol = 'https:';
  base.pathname = '/';
  base.search = '';
  base.hash = '';
  return base;
}

function delay(milliseconds: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(new Error('Discord login was cancelled.'));
      return;
    }
    const timer = setTimeout(done, milliseconds);
    function done(): void {
      signal.removeEventListener('abort', cancel);
      resolve();
    }
    function cancel(): void {
      clearTimeout(timer);
      signal.removeEventListener('abort', cancel);
      reject(new Error('Discord login was cancelled.'));
    }
    signal.addEventListener('abort', cancel, { once: true });
  });
}
