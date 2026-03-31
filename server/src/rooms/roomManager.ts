import { Player, Room, RoomInfo, GamePhase, PublicPlayer, AvatarId, Spectator } from 'shared';
import { v4 as uuidv4 } from 'uuid';
import { GameEngine } from '../game/engine';

const MAX_PLAYERS = 6;
const ROOM_CODE_LENGTH = 5;

const AVATAR_COLORS = [
  '#EF4444', '#F59E0B', '#10B981', '#3B82F6', '#8B5CF6',
  '#EC4899', '#F97316', '#14B8A6', '#6366F1', '#D946EF',
];

function randomAvatarColor(): string {
  return AVATAR_COLORS[Math.floor(Math.random() * AVATAR_COLORS.length)];
}

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
  /** Maps socket ID → spectator mapping for spectators */
  private spectatorSocketMap: Map<string, { roomId: string; spectatorId: string }> = new Map();

  createRoom(socketId: string, playerName: string, avatarId?: AvatarId, avatarColor?: string): { room: Room; playerId: string } {
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
      avatarId: avatarId || 'default',
      avatarColor: avatarColor || randomAvatarColor(),
    };

    const room: Room = {
      id: roomId,
      hostId: playerId,
      players: [player],
      spectators: [],
      maxPlayers: MAX_PLAYERS,
      gameState: null,
      createdAt: Date.now(),
    };

    this.rooms.set(roomId, room);
    this.socketMap.set(socketId, { roomId, playerId });

    return { room, playerId };
  }

  joinRoom(socketId: string, roomId: string, playerName: string, avatarId?: AvatarId, avatarColor?: string): {
    success: boolean;
    error?: string;
    room?: Room;
    playerId?: string;
    asSpectator?: boolean;
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
      // Game in progress: join as spectator
      return this.joinAsSpectator(socketId, room, playerName, avatarId, avatarColor);
    }

    if (room.players.length >= room.maxPlayers) {
      // Room full: join as spectator
      return this.joinAsSpectator(socketId, room, playerName, avatarId, avatarColor);
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
      avatarId: avatarId || 'default',
      avatarColor: avatarColor || randomAvatarColor(),
    };

    room.players.push(player);
    this.socketMap.set(socketId, { roomId: room.id, playerId });

    return { success: true, room, playerId };
  }

  private joinAsSpectator(socketId: string, room: Room, name: string, avatarId?: AvatarId, avatarColor?: string): {
    success: boolean;
    room?: Room;
    playerId?: string;
    asSpectator?: boolean;
  } {
    const spectatorId = uuidv4();
    const spectator: Spectator = {
      id: spectatorId,
      name,
      avatarId: avatarId || 'default',
      avatarColor: avatarColor || randomAvatarColor(),
    };
    room.spectators.push(spectator);
    this.spectatorSocketMap.set(socketId, { roomId: room.id, spectatorId });
    return { success: true, room, playerId: spectatorId, asSpectator: true };
  }

  /** Promote a spectator to player (if room has space and game not active) */
  promoteSpectatorToPlayer(socketId: string): {
    success: boolean;
    error?: string;
    room?: Room;
    playerId?: string;
  } {
    const specMapping = this.spectatorSocketMap.get(socketId);
    if (!specMapping) return { success: false, error: 'Not a spectator' };

    const room = this.rooms.get(specMapping.roomId);
    if (!room) return { success: false, error: 'Room not found' };

    if (room.gameState && room.gameState.phase !== GamePhase.Lobby && room.gameState.phase !== GamePhase.GameOver) {
      return { success: false, error: 'Game in progress' };
    }

    if (room.players.length >= room.maxPlayers) {
      return { success: false, error: 'Room is full' };
    }

    const spectator = room.spectators.find(s => s.id === specMapping.spectatorId);
    if (!spectator) return { success: false, error: 'Spectator not found' };

    // Remove from spectators
    room.spectators = room.spectators.filter(s => s.id !== spectator.id);
    this.spectatorSocketMap.delete(socketId);

    // Create as player
    const playerId = uuidv4();
    const player: Player = {
      id: playerId,
      name: spectator.name,
      hand: [],
      cardCount: 0,
      isConnected: true,
      isReady: false,
      seatIndex: room.players.length,
      avatarId: spectator.avatarId,
      avatarColor: spectator.avatarColor,
    };
    room.players.push(player);
    this.socketMap.set(socketId, { roomId: room.id, playerId });

    // Assign host if no current host among players
    if (!room.players.some(p => p.id === room.hostId)) {
      room.hostId = playerId;
    }

    return { success: true, room, playerId };
  }

  /** Move a player to spectators */
  demotePlayerToSpectator(socketId: string): {
    success: boolean;
    error?: string;
    room?: Room;
    spectatorId?: string;
  } {
    const mapping = this.socketMap.get(socketId);
    if (!mapping) return { success: false, error: 'Not in a room' };

    const room = this.rooms.get(mapping.roomId);
    if (!room) return { success: false, error: 'Room not found' };

    if (room.gameState && room.gameState.phase === GamePhase.Playing) {
      return { success: false, error: 'Cannot spectate during active game' };
    }

    const player = room.players.find(p => p.id === mapping.playerId);
    if (!player) return { success: false, error: 'Player not found' };

    // Remove from players
    room.players = room.players.filter(p => p.id !== player.id);
    this.socketMap.delete(socketId);

    // Add as spectator
    const spectator: Spectator = {
      id: player.id,
      name: player.name,
      avatarId: player.avatarId,
      avatarColor: player.avatarColor,
    };
    room.spectators.push(spectator);
    this.spectatorSocketMap.set(socketId, { roomId: room.id, spectatorId: player.id });

    // Reassign host if needed
    if (room.hostId === player.id && room.players.length > 0) {
      room.hostId = room.players[0].id;
    }

    // Reassign seat indices
    room.players.forEach((p, i) => { p.seatIndex = i; });

    return { success: true, room, spectatorId: player.id };
  }

  leaveRoom(socketId: string): {
    roomId: string;
    playerId: string;
    room: Room | null;
    newHostId?: string;
    wasSpectator?: boolean;
  } | null {
    // Check if they're a spectator first
    const specMapping = this.spectatorSocketMap.get(socketId);
    if (specMapping) {
      this.spectatorSocketMap.delete(socketId);
      const room = this.rooms.get(specMapping.roomId);
      if (room) {
        room.spectators = room.spectators.filter(s => s.id !== specMapping.spectatorId);
        return { roomId: specMapping.roomId, playerId: specMapping.spectatorId, room, wasSpectator: true };
      }
      return null;
    }

    const mapping = this.socketMap.get(socketId);
    if (!mapping) return null;

    const { roomId, playerId } = mapping;
    const room = this.rooms.get(roomId);
    this.socketMap.delete(socketId);

    if (!room) return null;

    // If game is in progress, mark as disconnected instead of removing
    if (room.gameState && room.gameState.phase !== GamePhase.Lobby && room.gameState.phase !== GamePhase.GameOver) {
      const player = room.players.find(p => p.id === playerId);
      if (player) {
        player.isConnected = false;
        const engine = this.engines.get(roomId);
        if (engine) {
          engine.disconnectPlayer(playerId);
        }
      }
      // Reassign host if the leaving player was host
      let newHostId: string | undefined;
      if (room.hostId === playerId) {
        const connectedPlayer = room.players.find(p => p.id !== playerId && p.isConnected);
        if (connectedPlayer) {
          room.hostId = connectedPlayer.id;
          newHostId = connectedPlayer.id;
        }
      }
      return { roomId, playerId, room, newHostId };
    }

    // Remove player from lobby
    room.players = room.players.filter(p => p.id !== playerId);

    // If room is empty (no players AND no spectators), delete it
    if (room.players.length === 0 && room.spectators.length === 0) {
      this.rooms.delete(roomId);
      this.engines.delete(roomId);
      return { roomId, playerId, room: null };
    }

    // Reassign host if needed
    let newHostId: string | undefined;
    if (room.hostId === playerId && room.players.length > 0) {
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

    // Reset ready states for the new game
    room.players.forEach(p => { p.isReady = false; });

    // Shuffle player order
    for (let i = room.players.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [room.players[i], room.players[j]] = [room.players[j], room.players[i]];
    }

    const engine = new GameEngine(room.id, room.players);
    engine.startGame();

    this.engines.set(room.id, engine);
    room.gameState = engine.getState();

    return { success: true, engine, room };
  }

  /** Restart game immediately (host only, post-game) */
  restartGame(socketId: string): { success: boolean; error?: string; engine?: GameEngine; room?: Room } {
    const mapping = this.socketMap.get(socketId);
    if (!mapping) return { success: false, error: 'Not in a room' };

    const room = this.rooms.get(mapping.roomId);
    if (!room) return { success: false, error: 'Room not found' };

    if (room.hostId !== mapping.playerId) {
      return { success: false, error: 'Only the host can restart the game' };
    }

    // Remove disconnected players before restarting
    const disconnected = room.players.filter(p => !p.isConnected);
    for (const dp of disconnected) {
      room.players = room.players.filter(p => p.id !== dp.id);
      // Clean up socket mappings
      for (const [sid, m] of this.socketMap.entries()) {
        if (m.roomId === room.id && m.playerId === dp.id) {
          this.socketMap.delete(sid);
          break;
        }
      }
    }

    if (room.players.length < 2) {
      return { success: false, error: 'Need at least 2 players' };
    }

    // Shuffle player order for new game
    for (let i = room.players.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [room.players[i], room.players[j]] = [room.players[j], room.players[i]];
    }

    // Reset player state
    room.players.forEach((p, i) => {
      p.hand = [];
      p.cardCount = 0;
      p.isReady = false;
      p.seatIndex = i;
    });

    const engine = new GameEngine(room.id, room.players);
    engine.startGame();

    this.engines.set(room.id, engine);
    room.gameState = engine.getState();

    return { success: true, engine, room };
  }

  /** Return game to lobby (post-game) */
  returnToLobby(roomId: string): Room | null {
    const room = this.rooms.get(roomId);
    if (!room) return null;

    room.gameState = null;
    this.engines.delete(roomId);

    // Reset player state for lobby
    room.players.forEach((p, i) => {
      p.hand = [];
      p.cardCount = 0;
      p.isReady = false;
      p.seatIndex = i;
    });

    return room;
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

  /** Find socket ID for a player in a room */
  getSocketIdForPlayer(roomId: string, playerId: string): string | undefined {
    for (const [sid, mapping] of this.socketMap.entries()) {
      if (mapping.roomId === roomId && mapping.playerId === playerId) {
        return sid;
      }
    }
    return undefined;
  }

  /** Remove a player from lobby/game-over (not during active game) */
  removePlayer(roomId: string, playerId: string): void {
    const room = this.rooms.get(roomId);
    if (!room) return;
    room.players = room.players.filter(p => p.id !== playerId);
    const sid = this.getSocketIdForPlayer(roomId, playerId);
    if (sid) this.socketMap.delete(sid);
    room.players.forEach((p, i) => { p.seatIndex = i; });
  }

  getRoomInfo(room: Room): RoomInfo & { players: PublicPlayer[] } {
    return {
      id: room.id,
      hostId: room.hostId,
      playerCount: room.players.length,
      maxPlayers: room.maxPlayers,
      phase: room.gameState?.phase ?? GamePhase.Lobby,
      spectators: room.spectators,
      players: room.players.map(p => ({
        id: p.id,
        name: p.name,
        cardCount: p.hand.length,
        isConnected: p.isConnected,
        isReady: p.isReady,
        seatIndex: p.seatIndex,
        avatarId: p.avatarId,
        avatarColor: p.avatarColor,
      })),
    };
  }

  getSpectatorMapping(socketId: string): { roomId: string; spectatorId: string } | undefined {
    return this.spectatorSocketMap.get(socketId);
  }

  /** Kick a disconnected player from active game */
  kickDisconnectedPlayer(roomId: string, playerId: string): {
    success: boolean;
    gameOver: boolean;
    room?: Room;
  } {
    const room = this.rooms.get(roomId);
    if (!room) return { success: false, gameOver: false };

    const engine = this.engines.get(roomId);
    if (!engine) return { success: false, gameOver: false };

    const result = engine.kickPlayer(playerId);

    // Remove from players list
    room.players = room.players.filter(p => p.id !== playerId);

    // Clean up socket mapping for this player
    for (const [sid, mapping] of this.socketMap.entries()) {
      if (mapping.roomId === roomId && mapping.playerId === playerId) {
        this.socketMap.delete(sid);
        break;
      }
    }

    // Reassign host if needed
    if (room.hostId === playerId && room.players.length > 0) {
      room.hostId = room.players[0].id;
    }

    room.gameState = engine.getState();
    return { success: true, gameOver: result.gameOver, room };
  }

  /** Remove a room entirely */
  removeRoom(roomId: string): void {
    this.rooms.delete(roomId);
    this.engines.delete(roomId);
    // Clean up socket mappings
    for (const [sid, mapping] of this.socketMap.entries()) {
      if (mapping.roomId === roomId) this.socketMap.delete(sid);
    }
    for (const [sid, mapping] of this.spectatorSocketMap.entries()) {
      if (mapping.roomId === roomId) this.spectatorSocketMap.delete(sid);
    }
  }
}
