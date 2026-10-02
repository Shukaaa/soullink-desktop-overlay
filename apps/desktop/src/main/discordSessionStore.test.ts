import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { DiscordSessionStore, type SecureStorage } from './discordSessionStore';

class TestSecureStorage implements SecureStorage {
  constructor(private readonly available = true) {}

  isEncryptionAvailable(): boolean {
    return this.available;
  }

  encryptString(value: string): Buffer {
    return Buffer.from(Buffer.from(value).toString('base64'));
  }

  decryptString(value: Buffer): string {
    return Buffer.from(value.toString(), 'base64').toString();
  }
}

describe('DiscordSessionStore', () => {
  let directory: string;

  afterEach(() => {
    if (directory) rmSync(directory, { recursive: true, force: true });
  });

  it('persists encrypted credentials per server origin and loads them after restart', () => {
    directory = mkdtempSync(join(tmpdir(), 'soullink-discord-session-'));
    const storage = new TestSecureStorage();
    const store = new DiscordSessionStore(directory, storage);
    const session = { token: 'secret-session-token-012345678901234567', username: 'Trainer' };
    store.set('https://play.example.com/socket', session);

    const rawFile = readFileSync(join(directory, 'discord-sessions.json'), 'utf-8');
    expect(rawFile).not.toContain(session.token);
    expect(new DiscordSessionStore(directory, storage).get('wss://play.example.com')).toEqual(session);
    expect(store.get('wss://other.example.com')).toBeNull();

    store.delete('wss://play.example.com');
    expect(store.get('wss://play.example.com')).toBeNull();
  });

  it('does not save a session when operating-system encryption is unavailable', () => {
    directory = mkdtempSync(join(tmpdir(), 'soullink-discord-session-'));
    const store = new DiscordSessionStore(directory, new TestSecureStorage(false));
    expect(() =>
      store.set('ws://localhost:8787', {
        token: 'secret-session-token-012345678901234567',
        username: 'Trainer',
      })
    ).toThrowError(/secure storage is unavailable/i);
  });

  it('requires encrypted WebSockets for non-local servers', () => {
    directory = mkdtempSync(join(tmpdir(), 'soullink-discord-session-'));
    const store = new DiscordSessionStore(directory, new TestSecureStorage());
    expect(() => store.get('ws://play.example.com')).toThrowError(/must use wss/i);
  });
});
