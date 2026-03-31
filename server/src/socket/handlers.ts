import { Server, Socket } from 'socket.io';
import { Suit, ClientToServerEvents, ServerToClientEvents, SoundType, GamePhase } from 'shared';
import { RoomManager } from '../rooms/roomManager';
import { GameEngine } from '../game/engine';

type TypedSocket = Socket<ClientToServerEvents, ServerToClientEvents>;
type TypedServer = Server<ClientToServerEvents, ServerToClientEvents>;

const MAX_NAME_LENGTH = 20;
const MAX_CHAT_LENGTH = 200;
const TURN_TIMEOUT_MS = 30_000;
const COOLDOWN_MS = 3_000;
const TURN_COOLDOWN_MS = 2_000;
const DISCONNECT_KICK_MS = 60 * 1000; // 1 minute

function sanitizeName(name: string): string {
  return name.trim().slice(0, MAX_NAME_LENGTH).replace(/[<>&"'/]/g, '');
}

function sanitizeChat(msg: string): string {
  return msg.trim().slice(0, MAX_CHAT_LENGTH).replace(/[<>&"'/]/g, '');
}

export function setupSocketHandlers(io: TypedServer, roomManager: RoomManager): void {
  /** Timer handles per room */
  const turnTimers: Map<string, NodeJS.Timeout> = new Map();
  /** Disconnect kick timers: playerId → timeout */
  const disconnectKickTimers: Map<string, NodeJS.Timeout> = new Map();

  function clearTurnTimer(roomId: string) {
    const timer = turnTimers.get(roomId);
    if (timer) {
      clearTimeout(timer);
      turnTimers.delete(roomId);
    }
  }

  function startTurnTimer(roomId: string) {
    clearTurnTimer(roomId);

    // Add 2s inter-turn cooldown before the actual turn timer starts
    const timer = setTimeout(() => {
      turnTimers.delete(roomId);
      handleTimerExpiry(roomId);
    }, TURN_TIMEOUT_MS + TURN_COOLDOWN_MS);

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

  /** After game over, remove all disconnected players from the room */
  function cleanupDisconnectedPlayers(roomId: string) {
    const room = roomManager.getRoom(roomId);
    if (!room) return;

    const disconnected = room.players.filter(p => !p.isConnected);
    for (const dp of disconnected) {
      // Clear any pending kick timers
      clearDisconnectKickTimer(dp.id);
      // Remove from room
      room.players = room.players.filter(p => p.id !== dp.id);
    }

    // Reassign host if needed
    if (disconnected.some(d => d.id === room.hostId) && room.players.length > 0) {
      room.hostId = room.players[0].id;
    }

    // Notify remaining players
    if (disconnected.length > 0) {
      io.to(roomId).emit('room-updated', roomManager.getRoomInfo(room));
    }
  }

  function startDisconnectKickTimer(roomId: string, playerId: string) {
    clearDisconnectKickTimer(playerId);
    const timer = setTimeout(() => {
      disconnectKickTimers.delete(playerId);
      handleDisconnectKick(roomId, playerId);
    }, DISCONNECT_KICK_MS);
    disconnectKickTimers.set(playerId, timer);
  }

  function clearDisconnectKickTimer(playerId: string) {
    const timer = disconnectKickTimers.get(playerId);
    if (timer) {
      clearTimeout(timer);
      disconnectKickTimers.delete(playerId);
    }
  }

  function handleDisconnectKick(roomId: string, playerId: string) {
    const room = roomManager.getRoom(roomId);
    if (!room) return;

    const player = room.players.find(p => p.id === playerId);
    if (!player || player.isConnected) return; // Reconnected, don't kick

    const result = roomManager.kickDisconnectedPlayer(roomId, playerId);
    if (!result.success || !result.room) return;

    io.to(roomId).emit('player-left', { playerId, newHostId: result.room.hostId });
    io.to(roomId).emit('room-updated', roomManager.getRoomInfo(result.room));

    const engine = roomManager.getEngine(roomId);
    if (engine) {
      if (result.gameOver) {
        const state = engine.getState();
        const winner = state.players.find(p => p.id === state.winnerId);
        io.to(roomId).emit('game-over', {
          winnerId: state.winnerId || '',
          winnerName: winner?.name || 'Unknown',
        });
        emitSound(roomId, 'game-win');
        clearTurnTimer(roomId);
        cleanupDisconnectedPlayers(roomId);
      } else {
        broadcastGameState(io, roomId, engine, result.room.spectators);
        const state = engine.getState();
        if (state.phase === GamePhase.Playing) {
          io.to(roomId).emit('turn-changed', {
            currentPlayerIndex: state.currentPlayerIndex,
            turnStartedAt: state.turnStartedAt,
          });
          startTurnTimer(roomId);
        }
      }
    }
  }

  /** Check if game should end due to lack of connected players */
  function checkConnectedPlayers(roomId: string) {
    const room = roomManager.getRoom(roomId);
    if (!room) return;
    const engine = roomManager.getEngine(roomId);
    if (!engine) return;
    const state = engine.getState();
    if (state.phase === GamePhase.GameOver || state.phase === GamePhase.Lobby) return;

    const connectedActive = engine.getConnectedActiveCount();

    if (connectedActive === 0) {
      // No one online — remove room
      clearTurnTimer(roomId);
      roomManager.removeRoom(roomId);
      return;
    }

    if (connectedActive <= 1) {
      // Only 1 connected player left — end game, they win
      const lastConnected = state.players.find(
        p => p.isConnected && !state.finishedPlayerIds.includes(p.id)
      );
      if (lastConnected) {
        // Kick all disconnected active players to trigger game over
        const disconnectedActive = state.players.filter(
          p => !p.isConnected && !state.finishedPlayerIds.includes(p.id)
        );
        for (const p of disconnectedActive) {
          engine.kickPlayer(p.id);
        }
        room.gameState = engine.getState();

        const finalState = engine.getState();
        if (finalState.phase === GamePhase.GameOver) {
          const winner = finalState.players.find(p => p.id === finalState.winnerId);
          io.to(roomId).emit('game-over', {
            winnerId: finalState.winnerId || '',
            winnerName: winner?.name || 'Unknown',
          });
          emitSound(roomId, 'game-win');
          clearTurnTimer(roomId);
          cleanupDisconnectedPlayers(roomId);
          broadcastGameState(io, roomId, engine, room.spectators);
        }
      }
    }
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

      // If reconnecting to active game, send game state and clear kick timer
      const engine = roomManager.getEngine(result.room.id);
      if (engine && result.playerId) {
        clearDisconnectKickTimer(result.playerId);
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
      if (state.phase === GamePhase.GameOver) {
        const winner = state.players.find(p => p.id === state.winnerId);
        io.to(mapping.roomId).emit('game-over', {
          winnerId: state.winnerId || '',
          winnerName: winner?.name || 'Unknown',
        });
        emitSound(mapping.roomId, 'game-win');
        clearTurnTimer(mapping.roomId);
        cleanupDisconnectedPlayers(mapping.roomId);
      } else if (result.playerFinished) {
        // A player finished but game continues with remaining players
        emitSound(mapping.roomId, 'game-win');
        io.to(mapping.roomId).emit('turn-changed', {
          currentPlayerIndex: state.currentPlayerIndex,
          turnStartedAt: state.turnStartedAt,
        });
        startTurnTimer(mapping.roomId);
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

      // Turn always passes after drawing — start timer for next player
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

      // If pass forced a draw (player hadn't drawn), notify
      if (result.drawnCards && result.drawnCards.length > 0) {
        socket.emit('card-drawn', {
          playerId: mapping.playerId,
          cardCount: result.drawnCards.length,
          drawnCards: result.drawnCards,
        });
        socket.to(mapping.roomId).emit('card-drawn', {
          playerId: mapping.playerId,
          cardCount: result.drawnCards.length,
        });
        emitSound(mapping.roomId, 'card-draw');
      }

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

      cb({ success: true, playerId: result.playerId });

      if (result.room) {
        io.to(result.room.id).emit('room-updated', roomManager.getRoomInfo(result.room));

        // Send game state to the promoted player so they see updated view
        const engine = roomManager.getEngine(result.room.id);
        if (engine && result.playerId) {
          socket.emit('game-state', engine.getClientState(result.playerId, result.room.spectators));
        }
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

    // ===== KICK PLAYER (host only) =====
    socket.on('kick-player', (data) => {
      const mapping = roomManager.getMapping(socket.id);
      if (!mapping) return;

      const room = roomManager.getRoom(mapping.roomId);
      if (!room) return;

      // Only host can kick
      if (room.hostId !== mapping.playerId) {
        socket.emit('error', { message: 'Only the host can kick players' });
        return;
      }

      // Can't kick yourself
      if (data.targetPlayerId === mapping.playerId) {
        socket.emit('error', { message: 'Cannot kick yourself' });
        return;
      }

      const target = room.players.find(p => p.id === data.targetPlayerId);
      if (!target) {
        socket.emit('error', { message: 'Player not found' });
        return;
      }

      const engine = roomManager.getEngine(mapping.roomId);
      const state = engine?.getState();

      // During active game: use kickPlayer engine method
      if (engine && state && state.phase !== GamePhase.Lobby && state.phase !== GamePhase.GameOver) {
        // Notify the kicked player and remove from socket.io room
        const kickedSid = roomManager.getSocketIdForPlayer(mapping.roomId, data.targetPlayerId);
        if (kickedSid) {
          io.to(kickedSid).emit('error', { message: 'You have been kicked from the room' });
          const kickedSocket = io.sockets.sockets.get(kickedSid);
          if (kickedSocket) kickedSocket.leave(mapping.roomId);
        }

        const result = roomManager.kickDisconnectedPlayer(mapping.roomId, data.targetPlayerId);
        if (!result.success || !result.room) return;

        io.to(mapping.roomId).emit('player-left', { playerId: data.targetPlayerId, newHostId: result.room.hostId });
        io.to(mapping.roomId).emit('room-updated', roomManager.getRoomInfo(result.room));

        if (result.gameOver) {
          const gs = engine.getState();
          const winner = gs.players.find(p => p.id === gs.winnerId);
          io.to(mapping.roomId).emit('game-over', {
            winnerId: gs.winnerId || '',
            winnerName: winner?.name || 'Unknown',
          });
          emitSound(mapping.roomId, 'game-win');
          clearTurnTimer(mapping.roomId);
          cleanupDisconnectedPlayers(mapping.roomId);
        } else {
          broadcastGameState(io, mapping.roomId, engine, result.room.spectators);
          const gs = engine.getState();
          if (gs.phase === GamePhase.Playing) {
            io.to(mapping.roomId).emit('turn-changed', {
              currentPlayerIndex: gs.currentPlayerIndex,
              turnStartedAt: gs.turnStartedAt,
            });
            startTurnTimer(mapping.roomId);
          }
        }
      } else {
        // In lobby or game-over: just remove the player
        const kickedSid = roomManager.getSocketIdForPlayer(mapping.roomId, data.targetPlayerId);
        roomManager.removePlayer(mapping.roomId, data.targetPlayerId);

        if (kickedSid) {
          io.to(kickedSid).emit('error', { message: 'You have been kicked from the room' });
          const kickedSocket = io.sockets.sockets.get(kickedSid);
          if (kickedSocket) kickedSocket.leave(mapping.roomId);
        }

        io.to(mapping.roomId).emit('player-left', { playerId: data.targetPlayerId, newHostId: room.hostId });
        io.to(mapping.roomId).emit('room-updated', roomManager.getRoomInfo(room));
      }
    });

    // ===== RESTART GAME (host only, post-game) =====
    socket.on('restart-game', () => {
      const result = roomManager.restartGame(socket.id);
      if (!result.success || !result.engine || !result.room) {
        socket.emit('error', { message: result.error || 'Failed to restart game' });
        return;
      }

      // Send individual game state to each player
      for (const player of result.room.players) {
        const playerSockets = getPlayerSockets(io, result.room.id, player.id);
        for (const sid of playerSockets) {
          io.to(sid).emit('game-state', result.engine.getClientState(player.id, result.room.spectators));
        }
      }

      // Send state to spectators
      for (const spec of result.room.spectators) {
        const specSockets = getSpectatorSockets(io, result.room.id, spec.id);
        for (const sid of specSockets) {
          io.to(sid).emit('game-state', result.engine.getClientState('__spectator__', result.room.spectators));
        }
      }

      emitSound(result.room.id, 'turn-start');
      startTurnTimer(result.room.id);
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
    // Before leaveRoom, capture mapping for kick timer
    const mapping = roomManager.getMapping(socket.id);

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

        // If player disconnected during active game (marked as disconnected, not removed),
        // start a 2-minute kick timer and check if game should end
        const state = engine.getState();
        if (state.phase !== GamePhase.Lobby && state.phase !== GamePhase.GameOver) {
          const player = state.players.find(p => p.id === result.playerId);
          if (player && !player.isConnected) {
            startDisconnectKickTimer(result.roomId, result.playerId);
          }
          // Check if only 1 connected player remains
          checkConnectedPlayers(result.roomId);
        }
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
