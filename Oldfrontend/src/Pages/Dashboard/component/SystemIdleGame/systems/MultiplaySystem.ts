/**
 * MultiplaySystem — Socket.io client for multiplayer relay.
 * Connects to the backend socket.io server, handles room join/leave,
 * and relays game events (player position, item drops, tree chops) to peers.
 */
import { io, Socket } from 'socket.io-client';
import { gameBus } from '../shared/EventBus';
import {
  normalizeRemoteGameEvent,
  type GameEventType,
  type MultiplayRoomPlayer,
  type WorldSnapshot,
} from '../sync/remoteGameEventSchema';

export type {
  GameEventType,
  MultiplayRoomPlayer,
  RemoteGameEvent,
  WorldSnapshot,
} from '../sync/remoteGameEventSchema';

export class MultiplaySystem {
  private socket: Socket | null = null;
  private _roomId: string | null = null;

  connect(token: string | null): Promise<void> {
    return new Promise((resolve, reject) => {
      const socket = io('', {
        path: '/socket.io',
        auth: { token: token ?? '' },
        reconnectionAttempts: 5,
        timeout: 6000,
      });
      this.socket = socket;

      socket.once('connect', () => {
        console.log('[Multiplay] connected, id=', socket.id);
        resolve();
      });
      socket.once('connect_error', (err: Error) => {
        console.error('[Multiplay] connect error:', err.message);
        reject(err);
      });

      this._setupListeners(socket);
    });
  }

  private _setupListeners(socket: Socket): void {
    socket.on('room_joined', (data: { roomId: string; isHost: boolean; players: MultiplayRoomPlayer[] }) => {
      this._roomId = data.roomId;
      gameBus.emit('mp:room_joined', { isHost: data.isHost, roomId: data.roomId, players: data.players });
    });

    socket.on('peer_joined', (data: { userId: string; displayName: string }) => {
      gameBus.emit('mp:peer_joined', { userId: data.userId, displayName: data.displayName });
    });

    socket.on('peer_left', (data: { userId: string }) => {
      gameBus.emit('mp:peer_left', { userId: data.userId });
    });

    socket.on('game_event', (data: unknown) => {
      const normalized = normalizeRemoteGameEvent(data);
      if (!normalized) {
        console.warn('[Multiplay] ignored invalid game_event payload', data);
        return;
      }
      gameBus.emit('mp:game_event', normalized);
    });

    socket.on('room_error', (data: { message: string }) => {
      gameBus.emit('mp:error', { message: data.message });
    });

    socket.on('snapshot_requested', () => {
      gameBus.emit('mp:snapshot_requested', {});
    });

    socket.on('world_snapshot', (data: WorldSnapshot) => {
      gameBus.emit('mp:world_snapshot', data);
    });
  }

  joinRoom(roomId: string): void {
    if (!this.socket?.connected) return;
    this.socket.emit('join_room', { roomId });
  }

  emit(type: GameEventType, payload: Record<string, unknown>): void {
    if (!this.socket?.connected || !this._roomId) return;
    this.socket.emit('game_event', { type, payload });
  }

  sendSnapshot(snapshot: WorldSnapshot): void {
    if (!this.socket?.connected || !this._roomId) return;
    this.socket.emit('world_snapshot', snapshot);
  }

  requestSnapshot(): void {
    if (!this.socket?.connected || !this._roomId) return;
    this.socket.emit('request_snapshot');
  }

  disconnect(): void {
    this.socket?.disconnect();
    this.socket = null;
    this._roomId = null;
  }

  get isConnected(): boolean { return this.socket?.connected ?? false; }
  get roomId(): string | null { return this._roomId; }
}
