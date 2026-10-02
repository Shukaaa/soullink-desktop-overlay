import fs from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import { MAX_NAME_LENGTH } from '@soullink/shared';
import { normalizeServerUrlForConnection } from '../common/serverUrl';

const sessionFileSchema = z.record(z.string());
const savedSessionSchema = z.object({
  token: z.string().min(32),
  username: z.string().min(1).max(MAX_NAME_LENGTH),
});

export interface SecureStorage {
  isEncryptionAvailable(): boolean;
  encryptString(value: string): Buffer;
  decryptString(value: Buffer): string;
}

export interface DiscordSession {
  token: string;
  username: string;
}

export class DiscordSessionStore {
  private readonly filePath: string;

  constructor(
    userDataDir: string,
    private readonly storage: SecureStorage
  ) {
    this.filePath = path.join(userDataDir, 'discord-sessions.json');
  }

  get(serverUrl: string): DiscordSession | null {
    const encrypted = this.readEntries()[serverKey(serverUrl)];
    if (!encrypted) return null;
    if (!this.storage.isEncryptionAvailable()) {
      throw new Error('Windows cannot decrypt the saved Discord session on this device.');
    }
    const value = JSON.parse(this.storage.decryptString(Buffer.from(encrypted, 'base64')));
    return savedSessionSchema.parse(value);
  }

  set(serverUrl: string, session: DiscordSession): void {
    if (!this.storage.isEncryptionAvailable()) {
      throw new Error('Secure storage is unavailable; the Discord session was not saved.');
    }
    const entries = this.readEntries();
    entries[serverKey(serverUrl)] = this.storage
      .encryptString(JSON.stringify(savedSessionSchema.parse(session)))
      .toString('base64');
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
    const tmpPath = `${this.filePath}.tmp`;
    fs.writeFileSync(tmpPath, JSON.stringify(entries), 'utf-8');
    fs.renameSync(tmpPath, this.filePath);
  }

  delete(serverUrl: string): void {
    const entries = this.readEntries();
    delete entries[serverKey(serverUrl)];
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
    const tmpPath = `${this.filePath}.tmp`;
    fs.writeFileSync(tmpPath, JSON.stringify(entries), 'utf-8');
    fs.renameSync(tmpPath, this.filePath);
  }

  private readEntries(): Record<string, string> {
    if (!fs.existsSync(this.filePath)) return {};
    return sessionFileSchema.parse(JSON.parse(fs.readFileSync(this.filePath, 'utf-8')));
  }
}

function serverKey(serverUrl: string): string {
  const url = new URL(normalizeServerUrlForConnection(serverUrl));
  if (url.protocol === 'ws:') url.protocol = 'http:';
  if (url.protocol === 'wss:') url.protocol = 'https:';
  return url.origin;
}
