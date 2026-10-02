import { createHash, randomBytes } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { MAX_NAME_LENGTH } from '@soullink/shared';
import type { LobbyRepository, DiscordUser } from './db/lobbyRepository';
import { logger } from './logger';

const DISCORD_AUTHORIZE_URL = 'https://discord.com/oauth2/authorize';
const DISCORD_TOKEN_URL = 'https://discord.com/api/oauth2/token';
const DISCORD_USER_URL = 'https://discord.com/api/users/@me';
const FLOW_TTL_MS = 5 * 60_000;
const MAX_ACTIVE_FLOWS = 1000;
const MAX_REQUEST_BODY_BYTES = 4096;

interface OAuthFlow {
  id: string;
  state: string;
  createdAt: number;
  user: DiscordUser | null;
  token: string | null;
  error: string | null;
}

interface DiscordTokenResponse {
  access_token?: unknown;
  token_type?: unknown;
}

interface DiscordProfileResponse {
  id?: unknown;
  username?: unknown;
}

export interface DiscordOAuthOptions {
  clientId: string | undefined;
  clientSecret: string | undefined;
  redirectUri: string | undefined;
}

/**
 * Server-side Discord OAuth authorization-code flow. Browser callbacks only
 * complete an in-memory, short-lived flow; the desktop polls for a one-use
 * SoulLink session token and never receives the Discord OAuth access token.
 */
export class DiscordOAuthService {
  private readonly flows = new Map<string, OAuthFlow>();
  private readonly flowIdsByState = new Map<string, string>();

  constructor(
    private readonly repository: LobbyRepository,
    private readonly options: DiscordOAuthOptions
  ) {}

  handles(request: IncomingMessage): boolean {
    const pathname = new URL(request.url ?? '/', 'http://localhost').pathname;
    return pathname.startsWith('/auth/discord/');
  }

  async handleRequest(request: IncomingMessage, response: ServerResponse): Promise<void> {
    const url = new URL(request.url ?? '/', 'http://localhost');
    if (request.method === 'POST' && url.pathname === '/auth/discord/start') {
      this.startFlow(response);
      return;
    }
    if (request.method === 'GET' && url.pathname === '/auth/discord/callback') {
      await this.completeFlow(url, response);
      return;
    }
    if (request.method === 'POST' && url.pathname === '/auth/discord/poll') {
      let body: unknown;
      try {
        body = await readJsonBody(request);
      } catch (error) {
        if (error instanceof SyntaxError || error instanceof InvalidRequestBodyError) {
          sendJson(response, 400, { error: 'Invalid Discord login attempt.' });
          return;
        }
        throw error;
      }
      if (
        typeof body !== 'object' ||
        body === null ||
        !('flowId' in body) ||
        typeof body.flowId !== 'string'
      ) {
        sendJson(response, 400, { error: 'Invalid Discord login attempt.' });
        return;
      }
      this.pollFlow(body.flowId, response);
      return;
    }
    sendJson(response, 404, { error: 'Not found.' });
  }

  private startFlow(response: ServerResponse): void {
    this.pruneExpiredFlows();
    if (!this.options.clientId || !this.options.clientSecret || !this.options.redirectUri) {
      sendJson(response, 503, { error: 'Discord OAuth is not configured on this server.' });
      return;
    }
    if (this.flows.size >= MAX_ACTIVE_FLOWS) {
      sendJson(response, 503, { error: 'Too many Discord login attempts are active.' });
      return;
    }

    const redirectUri = new URL(this.options.redirectUri);
    if (redirectUri.protocol !== 'https:' && redirectUri.hostname !== 'localhost' && redirectUri.hostname !== '127.0.0.1') {
      sendJson(response, 503, { error: 'Discord OAuth redirect URI must use HTTPS.' });
      return;
    }
    const id = randomBytes(24).toString('base64url');
    const state = randomBytes(32).toString('base64url');
    this.flows.set(id, { id, state, createdAt: Date.now(), user: null, token: null, error: null });
    this.flowIdsByState.set(state, id);

    const authorizeUrl = new URL(DISCORD_AUTHORIZE_URL);
    authorizeUrl.searchParams.set('client_id', this.options.clientId);
    authorizeUrl.searchParams.set('redirect_uri', this.options.redirectUri);
    authorizeUrl.searchParams.set('response_type', 'code');
    authorizeUrl.searchParams.set('scope', 'identify');
    authorizeUrl.searchParams.set('state', state);
    sendJson(response, 200, { flowId: id, authorizeUrl: authorizeUrl.toString() });
  }

  private async completeFlow(url: URL, response: ServerResponse): Promise<void> {
    this.pruneExpiredFlows();
    const state = url.searchParams.get('state');
    const flowId = state ? this.flowIdsByState.get(state) : undefined;
    const flow = flowId ? this.flows.get(flowId) : undefined;
    if (!flow || flow.state !== state || flow.user || flow.error) {
      sendHtml(response, 400, 'Login failed. Return to SoulLink and start again.');
      return;
    }
    this.flowIdsByState.delete(flow.state);

    try {
      const code = url.searchParams.get('code');
      if (!code || url.searchParams.has('error')) {
        throw new Error('Discord authorization was denied.');
      }
      const profile = await this.exchangeCode(code);
      const token = randomBytes(32).toString('base64url');
      this.repository.saveDiscordSession(profile, createHash('sha256').update(token).digest('hex'));
      flow.user = profile;
      flow.token = token;
      sendHtml(response, 200, 'Discord login complete. You can return to the SoulLink app.');
    } catch (error) {
      logger.warn('Discord OAuth callback failed', {
        error: error instanceof Error ? error.message : String(error),
      });
      flow.error = 'Discord login failed. Please try again.';
      sendHtml(response, 400, 'Discord login failed. Return to SoulLink and try again.');
    }
  }

  private pollFlow(id: string, response: ServerResponse): void {
    this.pruneExpiredFlows();
    const flow = this.flows.get(id);
    if (!flow) {
      sendJson(response, 404, { error: 'Discord login attempt expired. Start again.' });
      return;
    }
    if (flow.error) {
      this.deleteFlow(flow);
      sendJson(response, 400, { error: flow.error });
      return;
    }
    if (!flow.user || !flow.token) {
      sendJson(response, 202, { status: 'pending' });
      return;
    }
    const result = { status: 'complete', user: flow.user, token: flow.token };
    this.deleteFlow(flow);
    sendJson(response, 200, result);
  }

  private async exchangeCode(code: string): Promise<DiscordUser> {
    const body = new URLSearchParams({
      client_id: this.options.clientId!,
      client_secret: this.options.clientSecret!,
      grant_type: 'authorization_code',
      code,
      redirect_uri: this.options.redirectUri!,
    });
    const tokenResponse = await fetch(DISCORD_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
      body,
    });
    if (!tokenResponse.ok) {
      throw new Error(`Discord token exchange failed (${tokenResponse.status}).`);
    }
    const tokenPayload = (await tokenResponse.json()) as DiscordTokenResponse;
    if (typeof tokenPayload.access_token !== 'string' || tokenPayload.token_type !== 'Bearer') {
      throw new Error('Discord returned an invalid access token.');
    }

    const profileResponse = await fetch(DISCORD_USER_URL, {
      headers: { Authorization: `Bearer ${tokenPayload.access_token}`, Accept: 'application/json' },
    });
    if (!profileResponse.ok) {
      throw new Error(`Discord profile lookup failed (${profileResponse.status}).`);
    }
    const profile = (await profileResponse.json()) as DiscordProfileResponse;
    if (typeof profile.id !== 'string' || !/^\d{1,32}$/.test(profile.id)) {
      throw new Error('Discord returned an invalid account id.');
    }
    if (
      typeof profile.username !== 'string' ||
      !profile.username.trim() ||
      profile.username.trim().length > MAX_NAME_LENGTH
    ) {
      throw new Error('Discord returned an invalid username.');
    }
    return { id: profile.id, username: profile.username.trim() };
  }

  private pruneExpiredFlows(): void {
    const cutoff = Date.now() - FLOW_TTL_MS;
    for (const flow of this.flows.values()) {
      if (flow.createdAt < cutoff) this.deleteFlow(flow);
    }
  }

  private deleteFlow(flow: OAuthFlow): void {
    this.flows.delete(flow.id);
    this.flowIdsByState.delete(flow.state);
  }
}

function sendJson(response: ServerResponse, status: number, body: unknown): void {
  response.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
  });
  response.end(JSON.stringify(body));
}

function sendHtml(response: ServerResponse, status: number, message: string): void {
  response.writeHead(status, {
    'Content-Type': 'text/html; charset=utf-8',
    'Cache-Control': 'no-store',
    'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'",
    'X-Content-Type-Options': 'nosniff',
  });
  response.end(
    `<!doctype html><meta charset="utf-8"><title>SoulLink Discord Login</title><p>${message}</p>`
  );
}

async function readJsonBody(request: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let byteCount = 0;
  for await (const chunk of request) {
    const buffer = Buffer.from(chunk);
    byteCount += buffer.length;
    if (byteCount > MAX_REQUEST_BODY_BYTES) {
      throw new InvalidRequestBodyError('Discord login request body is too large.');
    }
    chunks.push(buffer);
  }
  if (byteCount === 0) return null;
  return JSON.parse(Buffer.concat(chunks).toString('utf-8')) as unknown;
}

class InvalidRequestBodyError extends Error {}
