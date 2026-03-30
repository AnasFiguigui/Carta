import { Player, Room, RoomInfo, GamePhase, PublicPlayer } from 'shared';
import { v4 as uuidv4 } from 'uuid';
import { GameEngine } from '../game/engine';

const MAX_PLAYERS = 6;
const ROOM_CODE_LENGTH = 5;

/** Generate a human-friendly room code */
function generateRoomCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // No I,O,0,1 to avoid confusion
  let code = '';
  for (let i = 0; i < ROOM_CODE_LENGTH; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

export class RoomManager {
  private rooms: Map<string, Room> = new Map();
  private engines: Map<string, GameEngine> = new Map();
  /** Maps socket ID → { roomId, playerId } */
  private socketMap: Map<string, { roomId: string; playerId: string }> = new Map();

  createRoom(socketId: string, playerName: string): { room: Room; playerId: string } {
    let roomId: string;
    do {
      roomId = generateRoomCode();
    } while (this.rooms.has(roomId));

    const playerId = uuidv4();
    const player: Player = {
      id: playerId,
      name: playerName,
      hand: [],
      cardCount: 0,
      isConnected: true,
      isReady: false,
      seatIndex: 0,
    };

    const room: Room = {
      id: roomId,
      hostId: playerId,
      players: [player],
      maxPlayers: MAX_PLAYERS,
      gameState: null,
      createdAt: Date.now(),
    };

    this.rooms.set(roomId, room);
    this.socketMap.set(socketId, { roomId, playerId });

    return { room, playerId };
  }

  joinRoom(socketId: string, roomId: string, playerName: string): {
    success: boolean;
    error?: string;
    room?: Room;
    playerId?: string;
  } {
    const room = this.rooms.get(roomId.toUpperCase());
    if (!room) {
      return { success: false, error: 'Room not found' };
    }

    if (room.gameState && room.gameState.phase !== GamePhase.Lobby) {
      // Allow reconnect if player was in game
      const existing = room.players.find(p => p.name === playerName && !p.isConnected);
      if (existing) {
        existing.isConnected = true;
        this.socketMap.set(socketId, { roomId: room.id, playerId: existing.id });
        const engine = this.engines.get(room.id);
        if (engine) {
          engine.reconnectPlayer(existing.id);
        }
        return { success: true, room, playerId: existing.id };
      }
      return { success: false, error: 'Game already in progress' };
    }

    if (room.players.length >= room.maxPlayers) {
      return { success: false, error: 'Room is full' };
    }

    // Check for duplicate names
    if (room.players.some(p => p.name.toLowerCase() === playerName.toLowerCase())) {
      return { success: false, error: 'Name already taken in this room' };
    }

    const playerId = uuidv4();
    const player: Player = {
      id: playerId,
      name: playerName,
      hand: [],
      cardCount: 0,
      isConnected: true,
      isReady: false,
      seatIndex: room.players.length,
    };

    room.players.push(player);
    this.socketMap.set(socketId, { roomId: room.id, playerId });

    return { success: true, room, playerId };
  }

  leaveRoom(socketId: string): {
    roomId: string;
    playerId: string;
    room: Room | null;
    newHostId?: string;
  } | null {
    const mapping = this.socketMap.get(socketId);
    if (!mapping) return null;

    const { roomId, playerId } = mapping;
    const room = this.rooms.get(roomId);
    this.socketMap.delete(socketId);

    if (!room) return null;

    // If game is in progress, mark as disconnected instead of removing
    if (room.gameState && room.gameState.phase !== GamePhase.Lobby) {
      const player = room.players.find(p => p.id === playerId);
      if (player) {
        player.isConnected = false;
        const engine = this.engines.get(roomId);
        if (engine) {
          engine.disconnectPlayer(playerId);
        }
      }
      return { roomId, playerId, room };
    }

    // Remove player from lobby
    room.players = room.players.filter(p => p.id !== playerId);

    // If room is empty, delete it
    if (room.players.length === 0) {
      this.rooms.delete(roomId);
      this.engines.delete(roomId);
      return { roomId, playerId, room: null };
    }

    // Reassign host if needed
    let newHostId: string | undefined;
    if (room.hostId === playerId) {
      room.hostId = room.players[0].id;
      newHostId = room.hostId;
    }

    // Reassign seat indices
    room.players.forEach((p, i) => {
      p.seatIndex = i;
    });

    return { roomId, playerId, room, newHostId };
  }

  toggleReady(socketId: string): { player: Player; room: Room } | null {
    const mapping = this.socketMap.get(socketId);
    if (!mapping) return null;

    const room = this.rooms.get(mapping.roomId);
    if (!room) return null;

    const player = room.players.find(p => p.id === mapping.playerId);
    if (!player) return null;

    player.isReady = !player.isReady;
    return { player, room };
  }

  startGame(socketId: string): { success: boolean; error?: string; engine?: GameEngine; room?: Room } {
    const mapping = this.socketMap.get(socketId);
    if (!mapping) return { success: false, error: 'Not in a room' };

    const room = this.rooms.get(mapping.roomId);
    if (!room) return { success: false, error: 'Room not found' };

    if (room.hostId !== mapping.playerId) {
      return { success: false, error: 'Only the host can start the game' };
    }

    if (room.players.length < 2) {
      return { success: false, error: 'Need at least 2 players' };
    }

    const allReady = room.players.every(p => p.isReady || p.id === room.hostId);
    if (!allReady) {
      return { success: false, error: 'Not all players are ready' };
    }

    const engine = new GameEngine(room.id, room.players);
    engine.startGame();

    this.engines.set(room.id, engine);
    room.gameState = engine.getState();

    return { success: true, engine, room };
  }

  getEngine(roomId: string): GameEngine | undefined {
    return this.engines.get(roomId);
  }

  getRoom(roomId: string): Room | undefined {
    return this.rooms.get(roomId);
  }

  getMapping(socketId: string): { roomId: string; playerId: string } | undefined {
    return this.socketMap.get(socketId);
  }

  getRoomInfo(room: Room): RoomInfo & { players: PublicPlayer[] } {
    return {
      id: room.id,
      hostId: room.hostId,
      playerCount: room.players.length,
      maxPlayers: room.maxPlayers,
      phase: room.gameState?.phase ?? GamePhase.Lobby,
      players: room.players.map(p => ({
        id: p.id,
        name: p.name,
        cardCount: p.hand.length,
        isConnected: p.isConnected,
        isReady: p.isReady,
        seatIndex: p.seatIndex,
      })),
    };
  }
}
