import { afterEach, describe, expect, it, vi } from 'vitest';
import { loginWithDiscord } from './discordLogin';

describe('loginWithDiscord', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('opens Discord OAuth and polls until the server returns a verified session', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ flowId: 'flow-1', authorizeUrl: 'https://discord.com/oauth2/authorize?state=s' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      )
      .mockResolvedValueOnce(new Response(JSON.stringify({ status: 'pending' }), { status: 202 }))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            status: 'complete',
            token: 'session-token-012345678901234567890123456789',
            user: { id: 'discord-1', username: 'Trainer' },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        )
      );
    vi.stubGlobal('fetch', fetchMock);
    const openExternal = vi.fn().mockResolvedValue(undefined);

    const result = await loginWithDiscord('https://play.example.com/socket', openExternal, new AbortController().signal);

    expect(openExternal).toHaveBeenCalledWith('https://discord.com/oauth2/authorize?state=s');
    expect(fetchMock).toHaveBeenNthCalledWith(1, new URL('https://play.example.com/auth/discord/start'), {
      method: 'POST',
      signal: expect.any(AbortSignal),
    });
    expect(result).toEqual({
      token: 'session-token-012345678901234567890123456789',
      userId: 'discord-1',
      username: 'Trainer',
    });
    expect(String(fetchMock.mock.calls[1][0])).toBe('https://play.example.com/auth/discord/poll');
    expect(fetchMock.mock.calls[1][1]).toMatchObject({
      method: 'POST',
      body: JSON.stringify({ flowId: 'flow-1' }),
    });
  });

  it('rejects a non-Discord authorization URL without opening it', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ flowId: 'flow-1', authorizeUrl: 'https://attacker.example/login' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      )
    );
    const openExternal = vi.fn();
    await expect(
      loginWithDiscord('ws://localhost:8787', openExternal, new AbortController().signal)
    ).rejects.toThrow(/invalid discord login address/i);
    expect(openExternal).not.toHaveBeenCalled();
  });

  it('does not send login tickets over an unencrypted remote WebSocket server', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    await expect(
      loginWithDiscord('ws://play.example.com', vi.fn(), new AbortController().signal)
    ).rejects.toThrow(/must use wss/i);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('explains when the server has no Discord OAuth endpoint instead of exposing a JSON parse error', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 404 }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      loginWithDiscord('wss://play.example.com', vi.fn(), new AbortController().signal)
    ).rejects.toThrow(/empty response \(HTTP 404\).*deploy the server version with Discord OAuth support/i);
  });

  it('surfaces the network error code when the server cannot be reached', async () => {
    const cause = Object.assign(new Error('connect timeout'), { code: 'UND_ERR_CONNECT_TIMEOUT' });
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('fetch failed', { cause })));

    await expect(
      loginWithDiscord('wss://play.example.com', vi.fn(), new AbortController().signal)
    ).rejects.toThrow(/could not reach the SoulLink server while starting Discord login \(UND_ERR_CONNECT_TIMEOUT\)/i);
  });
});
