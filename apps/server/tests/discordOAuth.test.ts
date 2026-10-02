import { createHash } from 'node:crypto';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DiscordOAuthService } from '../src/discordOAuth';
import { NullLobbyRepository } from '../src/db/lobbyRepository';
import type { DiscordUser } from '../src/db/lobbyRepository';

class OAuthRepository extends NullLobbyRepository {
  readonly sessions: Array<{ user: DiscordUser; tokenHash: string }> = [];

  saveDiscordSession(user: DiscordUser, tokenHash: string): void {
    this.sessions.push({ user, tokenHash });
  }
}

describe('DiscordOAuthService', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('validates the OAuth state and exchanges the Discord profile for a one-use server session', async () => {
    const repository = new OAuthRepository();
    const service = new DiscordOAuthService(repository, {
      clientId: 'client-id',
      clientSecret: 'client-secret',
      redirectUri: 'http://localhost/callback',
    });
    const discordFetch = vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      if (url.endsWith('/oauth2/token')) {
        return new Response(JSON.stringify({ access_token: 'discord-access-token', token_type: 'Bearer' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      return new Response(JSON.stringify({ id: '123456', username: 'Trainer' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    });
    const nativeFetch = globalThis.fetch;
    vi.stubGlobal('fetch', (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      return url.startsWith('https://discord.com/')
        ? discordFetch(input)
        : nativeFetch(input, init);
    });

    const server = createServer((request, response) => {
      if (service.handles(request)) void service.handleRequest(request, response);
      else {
        response.writeHead(404);
        response.end();
      }
    });
    await new Promise<void>((resolve) => server.listen(0, resolve));
    const address = server.address() as AddressInfo;
    const baseUrl = `http://127.0.0.1:${address.port}`;
    try {
      const startResponse = await nativeFetch(`${baseUrl}/auth/discord/start`, { method: 'POST' });
      expect(startResponse.status).toBe(200);
      const { flowId, authorizeUrl } = (await startResponse.json()) as {
        flowId: string;
        authorizeUrl: string;
      };
      const authorization = new URL(authorizeUrl);
      const state = authorization.searchParams.get('state')!;
      expect(authorization.origin).toBe('https://discord.com');
      expect(authorization.searchParams.get('scope')).toBe('identify');

      const invalidCallback = await nativeFetch(`${baseUrl}/auth/discord/callback?code=bad&state=wrong`);
      expect(invalidCallback.status).toBe(400);
      expect(discordFetch).not.toHaveBeenCalled();

      const callback = await nativeFetch(
        `${baseUrl}/auth/discord/callback?code=authorization-code&state=${encodeURIComponent(state)}`
      );
      expect(callback.status).toBe(200);
      expect(await callback.text()).toContain('login complete');

      const poll = await nativeFetch(`${baseUrl}/auth/discord/poll`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ flowId }),
      });
      const completed = (await poll.json()) as {
        status: string;
        token: string;
        user: DiscordUser;
      };
      expect(completed.status).toBe('complete');
      expect(completed.user).toEqual({ id: '123456', username: 'Trainer' });
      expect(repository.sessions).toEqual([
        {
          user: completed.user,
          tokenHash: createHash('sha256').update(completed.token).digest('hex'),
        },
      ]);

      const usedPoll = await nativeFetch(`${baseUrl}/auth/discord/poll`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ flowId }),
      });
      expect(usedPoll.status).toBe(404);
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  it('does not start login flows when the server has no Discord OAuth configuration', async () => {
    const service = new DiscordOAuthService(new OAuthRepository(), {
      clientId: undefined,
      clientSecret: undefined,
      redirectUri: undefined,
    });
    const server = createServer((request, response) => {
      if (service.handles(request)) void service.handleRequest(request, response);
    });
    await new Promise<void>((resolve) => server.listen(0, resolve));
    const address = server.address() as AddressInfo;
    try {
      const response = await fetch(`http://127.0.0.1:${address.port}/auth/discord/start`, { method: 'POST' });
      expect(response.status).toBe(503);
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });
});
