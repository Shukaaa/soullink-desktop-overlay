/**
 * Error codes shared between server and client so the desktop UI can render
 * user-friendly messages without string matching.
 */
export enum ErrorCode {
  INVALID_MESSAGE = 'INVALID_MESSAGE',
  LOBBY_NOT_FOUND = 'LOBBY_NOT_FOUND',
  LOBBY_FULL = 'LOBBY_FULL',
  NOT_HOST = 'NOT_HOST',
  PLAYER_NOT_FOUND = 'PLAYER_NOT_FOUND',
  DUPLICATE_NAME = 'DUPLICATE_NAME',
  INVALID_TOKEN = 'INVALID_TOKEN',
  NOT_IN_LOBBY = 'NOT_IN_LOBBY',
  INVALID_SLOT = 'INVALID_SLOT',
  CANNOT_KICK_SELF = 'CANNOT_KICK_SELF',
  INTERNAL_ERROR = 'INTERNAL_ERROR',
}

export class ProtocolError extends Error {
  readonly code: ErrorCode;

  constructor(code: ErrorCode, message: string) {
    super(message);
    this.name = 'ProtocolError';
    this.code = code;
  }
}
