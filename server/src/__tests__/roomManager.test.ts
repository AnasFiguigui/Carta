import { describe, it, expect, beforeEach } from 'vitest';
import { RoomManager } from '../rooms/roomManager';
import { GamePhase } from 'shared';

/** Helper: createRoom that asserts non-null (tests run well under MAX_ROOMS) */
function createRoom(rm: RoomManager, socketId: string, name: string, avatarId?: string, avatarColor?: string) {
  const result = rm.createRoom(socketId, name, avatarId as never, avatarColor);
  expect(result).not.toBeNull();
  return result!;
}

function startAndFinishGame(rm: RoomManager) {
  const { room } = createRoom(rm, 'socket-1', 'Alice');
  rm.joinRoom('socket-2', room.id, 'Bob');
  rm.toggleReady('socket-2');
  const startResult = rm.startGame('socket-1');
  if (startResult.engine) {
    startResult.engine.getState().phase = GamePhase.GameOver;
  }
  return room;
}

describe('RoomManager', () => {
  let rm: RoomManager;

  beforeEach(() => {
    rm = new RoomManager();
  });

  describe('createRoom', () => {
    it('creates a room and returns room + playerId', () => {
      const { room, playerId } = createRoom(rm, 'socket-1', 'Alice');
      expect(room.id).toHaveLength(5);
      expect(room.hostId).toBe(playerId);
      expect(room.players).toHaveLength(1);
      expect(room.players[0].name).toBe('Alice');
    });

    it('sets default avatar', () => {
      const { room } = createRoom(rm, 'socket-1', 'Alice');
      expect(room.players[0].avatarId).toBe('default');
    });

    it('uses custom avatar if provided', () => {
      const { room } = createRoom(rm, 'socket-1', 'Alice', 'knight', '#FF0000');
      expect(room.players[0].avatarId).toBe('knight');
      expect(room.players[0].avatarColor).toBe('#FF0000');
    });

    it('maps socket to room and player', () => {
      const { room, playerId } = createRoom(rm, 'socket-1', 'Alice');
      const mapping = rm.getMapping('socket-1');
      expect(mapping).toEqual({ roomId: room.id, playerId });
    });
  });

  describe('joinRoom', () => {
    it('allows joining an existing room', () => {
      const { room } = createRoom(rm, 'socket-1', 'Alice');
      const result = rm.joinRoom('socket-2', room.id, 'Bob');
      expect(result.success).toBe(true);
      expect(result.room?.players).toHaveLength(2);
    });

    it('rejects non-existent room', () => {
      const result = rm.joinRoom('socket-1', 'NONEXIST', 'Alice');
      expect(result.success).toBe(false);
      expect(result.error).toBe('Room not found');
    });

    it('rejects duplicate names', () => {
      const { room } = createRoom(rm, 'socket-1', 'Alice');
      const result = rm.joinRoom('socket-2', room.id, 'alice'); // case-insensitive
      expect(result.success).toBe(false);
      expect(result.error).toBe('Name already taken in this room');
    });

    it('is case-insensitive for room code', () => {
      const { room } = createRoom(rm, 'socket-1', 'Alice');
      const result = rm.joinRoom('socket-2', room.id.toLowerCase(), 'Bob');
      expect(result.success).toBe(true);
    });

    it('joins as spectator when room is full', () => {
      const { room } = createRoom(rm, 'socket-1', 'P1');
      for (let i = 2; i <= 6; i++) {
        rm.joinRoom(`socket-${i}`, room.id, `P${i}`);
      }
      // 7th player should become spectator
      const result = rm.joinRoom('socket-7', room.id, 'P7');
      expect(result.success).toBe(true);
      expect(result.asSpectator).toBe(true);
    });
  });

  describe('leaveRoom', () => {
    it('removes player from lobby', () => {
      const { room } = createRoom(rm, 'socket-1', 'Alice');
      rm.joinRoom('socket-2', room.id, 'Bob');
      const result = rm.leaveRoom('socket-2');
      expect(result).not.toBeNull();
      expect(result?.room?.players).toHaveLength(1);
    });

    it('deletes room when last player leaves', () => {
      const { room } = createRoom(rm, 'socket-1', 'Alice');
      rm.leaveRoom('socket-1');
      expect(rm.getRoom(room.id)).toBeUndefined();
    });

    it('reassigns host when host leaves', () => {
      const { room } = createRoom(rm, 'socket-1', 'Alice');
      rm.joinRoom('socket-2', room.id, 'Bob');
      const result = rm.leaveRoom('socket-1');
      expect(result).not.toBeNull();
      expect(result?.newHostId).toBeDefined();
      expect(result?.room?.hostId).not.toBe(result?.playerId);
    });

    it('returns null for unknown socket', () => {
      const result = rm.leaveRoom('nonexistent');
      expect(result).toBeNull();
    });
  });

  describe('toggleReady', () => {
    it('toggles player ready state', () => {
      createRoom(rm, 'socket-1', 'Alice');
      const result1 = rm.toggleReady('socket-1');
      expect(result1?.player.isReady).toBe(true);
      const result2 = rm.toggleReady('socket-1');
      expect(result2?.player.isReady).toBe(false);
    });

    it('returns null for unknown socket', () => {
      expect(rm.toggleReady('nonexistent')).toBeNull();
    });
  });

  describe('startGame', () => {
    it('starts game when host and enough players who are ready', () => {
      const { room } = createRoom(rm, 'socket-1', 'Alice');
      rm.joinRoom('socket-2', room.id, 'Bob');
      // Bob needs to be ready
      rm.toggleReady('socket-2');
      const result = rm.startGame('socket-1');
      expect(result.success).toBe(true);
      expect(result.engine).toBeDefined();
    });

    it('rejects if not the host', () => {
      const { room } = createRoom(rm, 'socket-1', 'Alice');
      rm.joinRoom('socket-2', room.id, 'Bob');
      const result = rm.startGame('socket-2');
      expect(result.success).toBe(false);
      expect(result.error).toBe('Only the host can start the game');
    });

    it('rejects with fewer than 2 players', () => {
      createRoom(rm, 'socket-1', 'Alice');
      const result = rm.startGame('socket-1');
      expect(result.success).toBe(false);
      expect(result.error).toBe('Need at least 2 players');
    });

    it('rejects if not all players ready', () => {
      const { room } = createRoom(rm, 'socket-1', 'Alice');
      rm.joinRoom('socket-2', room.id, 'Bob');
      // Bob is not ready
      const result = rm.startGame('socket-1');
      expect(result.success).toBe(false);
      expect(result.error).toBe('Not all players are ready');
    });
  });

  describe('getRoomInfo', () => {
    it('returns room info without full player data', () => {
      const { room } = createRoom(rm, 'socket-1', 'Alice');
      const info = rm.getRoomInfo(room);
      expect(info.id).toBe(room.id);
      expect(info.playerCount).toBe(1);
      expect(info.maxPlayers).toBe(6);
      expect(info.phase).toBe(GamePhase.Lobby);
      expect(info.players).toHaveLength(1);
      expect(info.players[0]).not.toHaveProperty('hand');
    });
  });

  describe('getSocketIdForPlayer', () => {
    it('finds socket for known player', () => {
      const { room, playerId } = createRoom(rm, 'socket-1', 'Alice');
      expect(rm.getSocketIdForPlayer(room.id, playerId)).toBe('socket-1');
    });

    it('returns undefined for unknown player', () => {
      const { room } = createRoom(rm, 'socket-1', 'Alice');
      expect(rm.getSocketIdForPlayer(room.id, 'fake-id')).toBeUndefined();
    });
  });

  describe('removeRoom', () => {
    it('removes room and cleans up mappings', () => {
      const { room } = createRoom(rm, 'socket-1', 'Alice');
      rm.removeRoom(room.id);
      expect(rm.getRoom(room.id)).toBeUndefined();
      expect(rm.getMapping('socket-1')).toBeUndefined();
    });
  });

  describe('spectator flow', () => {
    it('spectator can be promoted to player', () => {
      const { room } = createRoom(rm, 'socket-1', 'Alice');
      // Fill the room to force spectator
      for (let i = 2; i <= 6; i++) {
        rm.joinRoom(`socket-${i}`, room.id, `P${i}`);
      }
      const spec = rm.joinRoom('socket-7', room.id, 'Spectator');
      expect(spec.asSpectator).toBe(true);

      // Remove one player to make space
      rm.leaveRoom('socket-6');

      // Now promote
      const result = rm.promoteSpectatorToPlayer('socket-7');
      expect(result.success).toBe(true);
      expect(result.room?.players.some(p => p.name === 'Spectator')).toBe(true);
    });
  });

  describe('kickDisconnectedPlayer', () => {
    it('kicks a player during active game', () => {
      const { room } = createRoom(rm, 'socket-1', 'Alice');
      rm.joinRoom('socket-2', room.id, 'Bob');
      rm.toggleReady('socket-2');
      rm.startGame('socket-1');

      // Disconnect Bob
      rm.leaveRoom('socket-2');

      // Kick Bob
      const bob = room.players.find(p => p.name === 'Bob');
      if (bob) {
        const result = rm.kickDisconnectedPlayer(room.id, bob.id);
        expect(result.success).toBe(true);
      }
    });
  });

  describe('restartGame', () => {
    it('host can restart the game', () => {
      startAndFinishGame(rm);
      const result = rm.restartGame('socket-1');
      expect(result.success).toBe(true);
      expect(result.engine).toBeDefined();
      expect(result.room?.gameState?.phase).toBe(GamePhase.Playing);
    });

    it('rejects non-host restart', () => {
      startAndFinishGame(rm);
      const result = rm.restartGame('socket-2');
      expect(result.success).toBe(false);
      expect(result.error).toBe('Only the host can restart the game');
    });

    it('removes disconnected players on restart', () => {
      const { room } = createRoom(rm, 'socket-1', 'Alice');
      rm.joinRoom('socket-2', room.id, 'Bob');
      rm.joinRoom('socket-3', room.id, 'Charlie');
      rm.toggleReady('socket-2');
      rm.toggleReady('socket-3');
      rm.startGame('socket-1');

      // Disconnect Bob
      rm.leaveRoom('socket-2');

      // Force game over
      const engine = rm.getEngine(room.id);
      if (engine) engine.getState().phase = GamePhase.GameOver;

      const result = rm.restartGame('socket-1');
      expect(result.success).toBe(true);
      // Bob should be removed
      expect(result.room?.players.every(p => p.name !== 'Bob')).toBe(true);
    });

    it('fails with fewer than 2 connected players', () => {
      const { room } = createRoom(rm, 'socket-1', 'Alice');
      rm.joinRoom('socket-2', room.id, 'Bob');
      rm.toggleReady('socket-2');
      rm.startGame('socket-1');

      // Disconnect Bob
      rm.leaveRoom('socket-2');
      const engine = rm.getEngine(room.id);
      if (engine) engine.getState().phase = GamePhase.GameOver;

      const result = rm.restartGame('socket-1');
      expect(result.success).toBe(false);
      expect(result.error).toBe('Need at least 2 players');
    });

    it('creates a fresh engine with dealt hands', () => {
      startAndFinishGame(rm);
      const result = rm.restartGame('socket-1');
      expect(result.success).toBe(true);
      // Engine's players should have fresh hands dealt
      for (const p of result.engine!.getState().players) {
        expect(p.hand).toHaveLength(4);
        expect(p.cardCount).toBe(4);
      }
    });
  });

  describe('returnToLobby', () => {
    it('resets game state to null', () => {
      const { room } = createRoom(rm, 'socket-1', 'Alice');
      rm.joinRoom('socket-2', room.id, 'Bob');
      rm.toggleReady('socket-2');
      rm.startGame('socket-1');
      expect(room.gameState).not.toBeNull();

      const result = rm.returnToLobby(room.id);
      expect(result).not.toBeNull();
      expect(result?.gameState).toBeNull();
    });

    it('deletes the engine', () => {
      const { room } = createRoom(rm, 'socket-1', 'Alice');
      rm.joinRoom('socket-2', room.id, 'Bob');
      rm.toggleReady('socket-2');
      rm.startGame('socket-1');
      expect(rm.getEngine(room.id)).toBeDefined();

      rm.returnToLobby(room.id);
      expect(rm.getEngine(room.id)).toBeUndefined();
    });

    it('resets player state (hand, cardCount, isReady)', () => {
      const { room } = createRoom(rm, 'socket-1', 'Alice');
      rm.joinRoom('socket-2', room.id, 'Bob');
      rm.toggleReady('socket-2');
      rm.startGame('socket-1');

      const result = rm.returnToLobby(room.id);
      for (const p of result?.players ?? []) {
        expect(p.hand).toHaveLength(0);
        expect(p.cardCount).toBe(0);
        expect(p.isReady).toBe(false);
      }
    });

    it('returns null for nonexistent room', () => {
      expect(rm.returnToLobby('FAKE')).toBeNull();
    });
  });

  describe('demotePlayerToSpectator', () => {
    it('moves player to spectators', () => {
      const { room } = createRoom(rm, 'socket-1', 'Alice');
      rm.joinRoom('socket-2', room.id, 'Bob');

      const result = rm.demotePlayerToSpectator('socket-2');
      expect(result.success).toBe(true);
      expect(result.room?.players).toHaveLength(1);
      expect(result.room?.spectators.some(s => s.name === 'Bob')).toBe(true);
    });

    it('reassigns host if demoted player was host', () => {
      const { room } = createRoom(rm, 'socket-1', 'Alice');
      rm.joinRoom('socket-2', room.id, 'Bob');

      const result = rm.demotePlayerToSpectator('socket-1');
      expect(result.success).toBe(true);
      // Bob should be new host
      expect(result.room?.hostId).not.toBe(result.spectatorId);
    });

    it('rejects during active game', () => {
      const { room } = createRoom(rm, 'socket-1', 'Alice');
      rm.joinRoom('socket-2', room.id, 'Bob');
      rm.toggleReady('socket-2');
      rm.startGame('socket-1');

      const result = rm.demotePlayerToSpectator('socket-2');
      expect(result.success).toBe(false);
      expect(result.error).toBe('Cannot spectate during active game');
    });

    it('returns error for unknown socket', () => {
      const result = rm.demotePlayerToSpectator('nonexistent');
      expect(result.success).toBe(false);
    });
  });

  describe('setMapping / setSpectatorMapping', () => {
    it('re-maps socket to existing player', () => {
      const { room, playerId } = createRoom(rm, 'socket-1', 'Alice');
      rm.setMapping('socket-new', room.id, playerId);
      expect(rm.getMapping('socket-new')).toEqual({ roomId: room.id, playerId });
      // Old mapping should be cleaned up
      expect(rm.getMapping('socket-1')).toBeUndefined();
    });

    it('re-maps socket to existing spectator', () => {
      const { room } = createRoom(rm, 'socket-1', 'Alice');
      for (let i = 2; i <= 6; i++) {
        rm.joinRoom(`socket-${i}`, room.id, `P${i}`);
      }
      const spec = rm.joinRoom('socket-7', room.id, 'Spec');
      expect(spec.asSpectator).toBe(true);

      rm.setSpectatorMapping('socket-new', room.id, spec.playerId!);
      expect(rm.getSpectatorMapping('socket-new')).toEqual({ roomId: room.id, spectatorId: spec.playerId });
    });
  });

  describe('leaveRoom — during active game', () => {
    it('marks player as disconnected instead of removing', () => {
      const { room } = createRoom(rm, 'socket-1', 'Alice');
      rm.joinRoom('socket-2', room.id, 'Bob');
      rm.toggleReady('socket-2');
      rm.startGame('socket-1');

      const result = rm.leaveRoom('socket-2');
      expect(result).not.toBeNull();
      // Player should still be in the list but disconnected
      const bob = result?.room?.players.find(p => p.name === 'Bob');
      expect(bob).toBeDefined();
      expect(bob?.isConnected).toBe(false);
    });
  });

  describe('leaveRoom — spectator', () => {
    it('removes spectator from room', () => {
      const { room } = createRoom(rm, 'socket-1', 'Alice');
      for (let i = 2; i <= 6; i++) {
        rm.joinRoom(`socket-${i}`, room.id, `P${i}`);
      }
      rm.joinRoom('socket-7', room.id, 'Spec');

      const result = rm.leaveRoom('socket-7');
      expect(result).not.toBeNull();
      expect(result?.wasSpectator).toBe(true);
      expect(result?.room?.spectators.some(s => s.name === 'Spec')).toBe(false);
    });
  });

  describe('joinRoom — reconnection during active game', () => {
    it('reconnects a disconnected player by name', () => {
      const { room } = createRoom(rm, 'socket-1', 'Alice');
      rm.joinRoom('socket-2', room.id, 'Bob');
      rm.toggleReady('socket-2');
      rm.startGame('socket-1');

      // Disconnect Bob
      rm.leaveRoom('socket-2');
      const bob = room.players.find(p => p.name === 'Bob');
      expect(bob?.isConnected).toBe(false);

      // Reconnect with new socket
      const result = rm.joinRoom('socket-3', room.id, 'Bob');
      expect(result.success).toBe(true);
      expect(result.asSpectator).toBeUndefined();
      expect(bob?.isConnected).toBe(true);
    });

    it('joins as spectator if name does not match disconnected player', () => {
      const { room } = createRoom(rm, 'socket-1', 'Alice');
      rm.joinRoom('socket-2', room.id, 'Bob');
      rm.toggleReady('socket-2');
      rm.startGame('socket-1');

      // New player during active game
      const result = rm.joinRoom('socket-3', room.id, 'Charlie');
      expect(result.success).toBe(true);
      expect(result.asSpectator).toBe(true);
    });
  });
});
