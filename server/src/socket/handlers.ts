import { Server, Socket } from 'socket.io';
import { Suit, ClientToServerEvents, ServerToClientEvents, SoundType, GamePhase } from 'shared';
import { RoomManager } from '../rooms/roomManager';
import { GameEngine } from '../game/engine';

type TypedSocket = Socket<ClientToServerEvents, ServerToClientEvents>;
type TypedServer = Server<ClientToServerEvents, ServerToClientEvents>;

const MAX_NAME_LENGTH = 20;
const MAX_CHAT_LENGTH = 200;
const TURN_TIMEOUT_MS = 30_000;
const COOLDOWN_MS = 5_000;

function sanitizeName(name: string): string {
  return name.trim().slice(0, MAX_NAME_LENGTH).replace(/[<>&"'/]/g, '');
}

function sanitizeChat(msg: string): string {
  return msg.trim().slice(0, MAX_CHAT_LENGTH).replace(/[<>&"'/]/g, '');
}

export function setupSocketHandlers(io: TypedServer, roomManager: RoomManager): void {
  /** Timer handles per room */
  const turnTimers: Map<string, NodeJS.Timeout> = new Map();

  function clearTurnTimer(roomId: string) {
    const timer = turnTimers.get(roomId);
    if (timer) {
      clearTimeout(timer);
      turnTimers.delete(roomId);
    }
  }

  function startTurnTimer(roomId: string) {
    clearTurnTimer(roomId);

    const timer = setTimeout(() => {
      turnTimers.delete(roomId);
      handleTimerExpiry(roomId);
    }, TURN_TIMEOUT_MS);

    turnTimers.set(roomId, timer);
  }

  function handleTimerExpiry(roomId: string) {
    const engine = roomManager.getEngine(roomId);
    const room = roomManager.getRoom(roomId);
    if (!engine || !room) return;

    const state = engine.getState();
    if (state.phase !== GamePhase.Playing && state.phase !== GamePhase.ChoosingWildSuit) return;

    const expiredPlayerId = state.players[state.currentPlayerIndex].id;

    // Emit timer-expired
    io.to(roomId).emit('timer-expired', { playerId: expiredPlayerId });

    // After cooldown, auto-draw and advance
    setTimeout(() => {
      const currentState = engine.getState();
      if (currentState.phase !== GamePhase.Playing && currentState.phase !== GamePhase.ChoosingWildSuit) return;
      // Make sure it's still the same player's turn
      if (currentState.players[currentState.currentPlayerIndex].id !== expiredPlayerId) return;

      const result = engine.autoDrawCard();
      if (result.success) {
        io.to(roomId).emit('auto-draw', {
          playerId: result.playerId,
          cardCount: result.drawnCount,
        });

        emitSound(roomId, 'timer-end');
        broadcastGameState(io, roomId, engine, room.spectators);

        // Start timer for next player
        const newState = engine.getState();
        if (newState.phase === GamePhase.Playing) {
          io.to(roomId).emit('turn-changed', {
            currentPlayerIndex: newState.currentPlayerIndex,
            turnStartedAt: newState.turnStartedAt,
          });
          startTurnTimer(roomId);
        }
      }
    }, COOLDOWN_MS);
  }

  function emitSound(roomId: string, sound: SoundType) {
    io.to(roomId).emit('sound', { sound });
  }

  io.on('connection', (socket: TypedSocket) => {
    console.log(`Connected: ${socket.id}`);

    // ===== CREATE ROOM =====
    socket.on('create-room', (data, cb) => {
      const name = sanitizeName(data.playerName);
      if (!name) {
        cb({ roomId: '', playerId: '' });
        return;
      }

      const { room, playerId } = roomManager.createRoom(socket.id, name, data.avatarId, data.avatarColor);
      socket.join(room.id);
      cb({ roomId: room.id, playerId });

      io.to(room.id).emit('room-updated', roomManager.getRoomInfo(room));
    });

    // ===== JOIN ROOM =====
    socket.on('join-room', (data, cb) => {
      const name = sanitizeName(data.playerName);
      if (!name) {
        cb({ success: false, error: 'Invalid name' });
        return;
      }

      const result = roomManager.joinRoom(socket.id, data.roomId, name, data.avatarId, data.avatarColor);
      if (!result.success || !result.room) {
        cb({ success: false, error: result.error });
        return;
      }

      socket.join(result.room.id);
      cb({ success: true, playerId: result.playerId, asSpectator: result.asSpectator });

      if (result.asSpectator) {
        // Notify room about new spectator
        const spectator = result.room.spectators.find(s => s.id === result.playerId);
        if (spectator) {
          io.to(result.room.id).emit('spectator-joined', spectator);
        }
        emitSound(result.room.id, 'player-join');
      } else {
        emitSound(result.room.id, 'player-join');
      }

      // Notify all in room
      io.to(result.room.id).emit('room-updated', roomManager.getRoomInfo(result.room));

      // If reconnecting to active game, send game state
      const engine = roomManager.getEngine(result.room.id);
      if (engine && result.playerId) {
        socket.emit('game-state', engine.getClientState(result.playerId, result.room.spectators));
      }
    });

    // ===== LEAVE ROOM =====
    socket.on('leave-room', () => {
      handleLeave(socket);
    });

    // ===== TOGGLE READY =====
    socket.on('toggle-ready', () => {
      const result = roomManager.toggleReady(socket.id);
      if (result) {
        io.to(result.room.id).emit('room-updated', roomManager.getRoomInfo(result.room));
      }
    });

    // ===== START GAME =====
    socket.on('start-game', () => {
      const result = roomManager.startGame(socket.id);
      if (!result.success || !result.engine || !result.room) {
        socket.emit('error', { message: result.error || 'Failed to start game' });
        return;
      }

      // Send individual game state to each player
      for (const player of result.room.players) {
        const playerSockets = getPlayerSockets(io, result.room.id, player.id);
        for (const sid of playerSockets) {
          io.to(sid).emit('game-state', result.engine.getClientState(player.id, result.room.spectators));
        }
      }

      // Send state to spectators too
      for (const spec of result.room.spectators) {
        const specSockets = getSpectatorSockets(io, result.room.id, spec.id);
        for (const sid of specSockets) {
          // Spectators see state from first player's perspective (no private hand)
          io.to(sid).emit('game-state', result.engine.getClientState('__spectator__', result.room.spectators));
        }
      }

      emitSound(result.room.id, 'turn-start');
      startTurnTimer(result.room.id);
    });

    // ===== PLAY CARD =====
    socket.on('play-card', (data) => {
      const mapping = roomManager.getMapping(socket.id);
      if (!mapping) return;

      const engine = roomManager.getEngine(mapping.roomId);
      if (!engine) return;

      const result = engine.playCard(mapping.playerId, data.cardId);
      if (!result.success) {
        socket.emit('error', { message: result.error || 'Invalid move' });
        return;
      }

      clearTurnTimer(mapping.roomId);

      // Broadcast the card play
      io.to(mapping.roomId).emit('card-played', {
        playerId: mapping.playerId,
        card: result.card!,
        nextPlayerIndex: result.nextPlayerIndex!,
      });

      emitSound(mapping.roomId, 'card-play');

      // Broadcast effect if any
      if (result.effect && result.effect !== 'none') {
        const state = engine.getState();
        const targetPlayer = state.players[state.currentPlayerIndex];
        io.to(mapping.roomId).emit('effect-applied', {
          effect: result.effect,
          targetPlayerId: targetPlayer?.id || mapping.playerId,
          amount: result.effect === 'draw_two' ? state.pendingDrawAmount :
                  result.effect === 'draw_five' ? state.pendingDrawAmount : undefined,
        });
        if (result.effect === 'skip') emitSound(mapping.roomId, 'skip');
        if (result.effect === 'wild_suit') emitSound(mapping.roomId, 'wild');
        if (result.effect === 'draw_two' || result.effect === 'draw_five') emitSound(mapping.roomId, 'card-stack');
      }

      const room = roomManager.getRoom(mapping.roomId);
      broadcastGameState(io, mapping.roomId, engine, room?.spectators || []);

      // Check game over
      const state = engine.getState();
      if (state.winnerId) {
        const winner = state.players.find(p => p.id === state.winnerId);
        io.to(mapping.roomId).emit('game-over', {
          winnerId: state.winnerId,
          winnerName: winner?.name || 'Unknown',
        });
        emitSound(mapping.roomId, 'game-win');
        clearTurnTimer(mapping.roomId);
      } else if (state.phase === GamePhase.Playing) {
        // Start timer for next player's turn
        io.to(mapping.roomId).emit('turn-changed', {
          currentPlayerIndex: state.currentPlayerIndex,
          turnStartedAt: state.turnStartedAt,
        });
        startTurnTimer(mapping.roomId);
      }
      // If phase is ChoosingWildSuit, keep timer going for suit selection
      if (state.phase === GamePhase.ChoosingWildSuit) {
        startTurnTimer(mapping.roomId);
      }
    });

    // ===== DRAW CARD =====
    socket.on('draw-card', () => {
      const mapping = roomManager.getMapping(socket.id);
      if (!mapping) return;

      const engine = roomManager.getEngine(mapping.roomId);
      if (!engine) return;

      const result = engine.drawCard(mapping.playerId);
      if (!result.success) {
        socket.emit('error', { message: result.error || 'Cannot draw' });
        return;
      }

      clearTurnTimer(mapping.roomId);

      // Send drawn cards only to the drawing player
      socket.emit('card-drawn', {
        playerId: mapping.playerId,
        cardCount: result.drawnCards?.length || 0,
        drawnCards: result.drawnCards,
      });

      // Tell everyone else how many cards were drawn (no card details)
      socket.to(mapping.roomId).emit('card-drawn', {
        playerId: mapping.playerId,
        cardCount: result.drawnCards?.length || 0,
      });

      emitSound(mapping.roomId, 'card-draw');

      const room = roomManager.getRoom(mapping.roomId);
      broadcastGameState(io, mapping.roomId, engine, room?.spectators || []);

      // Restart timer for current player (they may need to play drawn card)
      const state = engine.getState();
      if (state.phase === GamePhase.Playing) {
        io.to(mapping.roomId).emit('turn-changed', {
          currentPlayerIndex: state.currentPlayerIndex,
          turnStartedAt: state.turnStartedAt,
        });
        startTurnTimer(mapping.roomId);
      }
    });

    // ===== CHOOSE SUIT (after playing 7) =====
    socket.on('choose-suit', (data) => {
      const mapping = roomManager.getMapping(socket.id);
      if (!mapping) return;

      const engine = roomManager.getEngine(mapping.roomId);
      if (!engine) return;

      // Validate the suit value is a valid enum member
      if (!Object.values(Suit).includes(data.suit)) {
        socket.emit('error', { message: 'Invalid suit selection' });
        return;
      }

      const result = engine.chooseSuit(mapping.playerId, data.suit);
      if (!result.success) {
        socket.emit('error', { message: result.error || 'Cannot choose suit' });
        return;
      }

      clearTurnTimer(mapping.roomId);

      io.to(mapping.roomId).emit('suit-chosen', {
        suit: data.suit,
        playerId: mapping.playerId,
      });

      const room = roomManager.getRoom(mapping.roomId);
      broadcastGameState(io, mapping.roomId, engine, room?.spectators || []);

      const state = engine.getState();
      if (state.phase === GamePhase.Playing) {
        io.to(mapping.roomId).emit('turn-changed', {
          currentPlayerIndex: state.currentPlayerIndex,
          turnStartedAt: state.turnStartedAt,
        });
        startTurnTimer(mapping.roomId);
      }
    });

    // ===== PASS TURN =====
    socket.on('pass-turn', () => {
      const mapping = roomManager.getMapping(socket.id);
      if (!mapping) return;

      const engine = roomManager.getEngine(mapping.roomId);
      if (!engine) return;

      const result = engine.passTurn(mapping.playerId);
      if (!result.success) {
        socket.emit('error', { message: result.error || 'Cannot pass' });
        return;
      }

      clearTurnTimer(mapping.roomId);

      const room = roomManager.getRoom(mapping.roomId);
      broadcastGameState(io, mapping.roomId, engine, room?.spectators || []);

      const state = engine.getState();
      if (state.phase === GamePhase.Playing) {
        io.to(mapping.roomId).emit('turn-changed', {
          currentPlayerIndex: state.currentPlayerIndex,
          turnStartedAt: state.turnStartedAt,
        });
        startTurnTimer(mapping.roomId);
      }
    });

    // ===== REQUEST STATE =====
    socket.on('request-state', () => {
      const mapping = roomManager.getMapping(socket.id);
      const specMapping = roomManager.getSpectatorMapping(socket.id);

      const roomId = mapping?.roomId || specMapping?.roomId;
      if (!roomId) return;

      const room = roomManager.getRoom(roomId);
      if (!room) return;

      // Send lobby state
      socket.emit('room-updated', roomManager.getRoomInfo(room));

      // Send game state if game is active
      const engine = roomManager.getEngine(roomId);
      if (engine) {
        if (mapping) {
          socket.emit('game-state', engine.getClientState(mapping.playerId, room.spectators));
        } else {
          socket.emit('game-state', engine.getClientState('__spectator__', room.spectators));
        }
      }
    });

    // ===== JOIN AS PLAYER (spectator → player) =====
    socket.on('join-as-player', (cb) => {
      const result = roomManager.promoteSpectatorToPlayer(socket.id);
      if (!result.success) {
        cb({ success: false, error: result.error });
        return;
      }

      cb({ success: true });

      if (result.room) {
        io.to(result.room.id).emit('room-updated', roomManager.getRoomInfo(result.room));
      }
    });

    // ===== BECOME SPECTATOR (player → spectator) =====
    socket.on('become-spectator', () => {
      const result = roomManager.demotePlayerToSpectator(socket.id);
      if (!result.success) {
        socket.emit('error', { message: result.error || 'Cannot become spectator' });
        return;
      }

      if (result.room && result.spectatorId) {
        const spectator = result.room.spectators.find(s => s.id === result.spectatorId);
        if (spectator) {
          io.to(result.room.id).emit('spectator-joined', spectator);
        }
        io.to(result.room.id).emit('room-updated', roomManager.getRoomInfo(result.room));
      }
    });

    // ===== CHAT =====
    socket.on('chat-message', (data) => {
      const mapping = roomManager.getMapping(socket.id);
      const specMapping = roomManager.getSpectatorMapping(socket.id);

      if (mapping) {
        const room = roomManager.getRoom(mapping.roomId);
        if (!room) return;
        const player = room.players.find(p => p.id === mapping.playerId);
        if (!player) return;
        const message = sanitizeChat(data.message);
        if (!message) return;
        io.to(mapping.roomId).emit('chat-message', {
          playerId: mapping.playerId,
          playerName: player.name,
          message,
        });
      } else if (specMapping) {
        const room = roomManager.getRoom(specMapping.roomId);
        if (!room) return;
        const spectator = room.spectators.find(s => s.id === specMapping.spectatorId);
        if (!spectator) return;
        const message = sanitizeChat(data.message);
        if (!message) return;
        io.to(specMapping.roomId).emit('chat-message', {
          playerId: specMapping.spectatorId,
          playerName: `👁 ${spectator.name}`,
          message,
        });
      }
    });

    // ===== DISCONNECT =====
    socket.on('disconnect', () => {
      console.log(`Disconnected: ${socket.id}`);
      handleLeave(socket);
    });
  });

  function handleLeave(socket: TypedSocket) {
    const result = roomManager.leaveRoom(socket.id);
    if (!result) return;

    socket.leave(result.roomId);

    if (result.room) {
      if (result.wasSpectator) {
        io.to(result.roomId).emit('spectator-left', { spectatorId: result.playerId });
      } else {
        io.to(result.roomId).emit('player-left', {
          playerId: result.playerId,
          newHostId: result.newHostId,
        });
      }
      io.to(result.roomId).emit('room-updated', roomManager.getRoomInfo(result.room));

      // Update game state for remaining players
      const engine = roomManager.getEngine(result.roomId);
      if (engine) {
        broadcastGameState(io, result.roomId, engine, result.room.spectators);
      }

      // If no players left and game had a timer, clean up
      if (result.room.players.length === 0) {
        clearTurnTimer(result.roomId);
      }
    }
  }

  function broadcastGameState(
    io: TypedServer,
    roomId: string,
    engine: GameEngine | undefined,
    spectators: { id: string; name: string }[] = [],
  ) {
    if (!engine) return;
    const room = roomManager.getRoom(roomId);
    if (!room) return;

    for (const player of room.players) {
      const sockets = getPlayerSockets(io, roomId, player.id);
      const clientState = engine.getClientState(player.id, room.spectators);
      for (const sid of sockets) {
        io.to(sid).emit('game-state', clientState);
      }
    }

    // Send to spectators
    const spectatorState = engine.getClientState('__spectator__', room.spectators);
    for (const spec of room.spectators) {
      const sockets = getSpectatorSockets(io, roomId, spec.id);
      for (const sid of sockets) {
        io.to(sid).emit('game-state', spectatorState);
      }
    }
  }

  /** Find all socket IDs for a player in a room */
  function getPlayerSockets(io: TypedServer, roomId: string, playerId: string): string[] {
    const roomSockets = io.sockets.adapter.rooms.get(roomId);
    if (!roomSockets) return [];

    const sids: string[] = [];
    for (const sid of roomSockets) {
      const mapping = roomManager.getMapping(sid);
      if (mapping && mapping.playerId === playerId) {
        sids.push(sid);
      }
    }
    return sids;
  }

  /** Find all socket IDs for a spectator in a room */
  function getSpectatorSockets(io: TypedServer, roomId: string, spectatorId: string): string[] {
    const roomSockets = io.sockets.adapter.rooms.get(roomId);
    if (!roomSockets) return [];

    const sids: string[] = [];
    for (const sid of roomSockets) {
      const mapping = roomManager.getSpectatorMapping(sid);
      if (mapping && mapping.spectatorId === spectatorId) {
        sids.push(sid);
      }
    }
    return sids;
  }
}
