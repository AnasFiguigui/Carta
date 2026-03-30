import { Server, Socket } from 'socket.io';
import { Suit, ClientToServerEvents, ServerToClientEvents } from 'shared';
import { RoomManager } from '../rooms/roomManager';
import { getCardEffect } from '../game/deck';

type TypedSocket = Socket<ClientToServerEvents, ServerToClientEvents>;
type TypedServer = Server<ClientToServerEvents, ServerToClientEvents>;

const MAX_NAME_LENGTH = 20;
const MAX_CHAT_LENGTH = 200;

function sanitizeName(name: string): string {
  return name.trim().slice(0, MAX_NAME_LENGTH).replace(/[<>&"'/]/g, '');
}

function sanitizeChat(msg: string): string {
  return msg.trim().slice(0, MAX_CHAT_LENGTH).replace(/[<>&"'/]/g, '');
}

export function setupSocketHandlers(io: TypedServer, roomManager: RoomManager): void {
  io.on('connection', (socket: TypedSocket) => {
    console.log(`Connected: ${socket.id}`);

    // ===== CREATE ROOM =====
    socket.on('create-room', (data, cb) => {
      const name = sanitizeName(data.playerName);
      if (!name) {
        cb({ roomId: '', playerId: '' });
        return;
      }

      const { room, playerId } = roomManager.createRoom(socket.id, name);
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

      const result = roomManager.joinRoom(socket.id, data.roomId, name);
      if (!result.success || !result.room) {
        cb({ success: false, error: result.error });
        return;
      }

      socket.join(result.room.id);
      cb({ success: true, playerId: result.playerId });

      // Notify all in room
      io.to(result.room.id).emit('room-updated', roomManager.getRoomInfo(result.room));

      // If reconnecting to active game, send game state
      const engine = roomManager.getEngine(result.room.id);
      if (engine && result.playerId) {
        socket.emit('game-state', engine.getClientState(result.playerId));
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
          io.to(sid).emit('game-state', result.engine.getClientState(player.id));
        }
      }
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

      // Broadcast the card play
      io.to(mapping.roomId).emit('card-played', {
        playerId: mapping.playerId,
        card: result.card!,
        nextPlayerIndex: result.nextPlayerIndex!,
      });

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
      }

      // Send updated state to all players
      broadcastGameState(io, mapping.roomId, engine);

      // Check game over
      const state = engine.getState();
      if (state.winnerId) {
        const winner = state.players.find(p => p.id === state.winnerId);
        io.to(mapping.roomId).emit('game-over', {
          winnerId: state.winnerId,
          winnerName: winner?.name || 'Unknown',
        });
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

      broadcastGameState(io, mapping.roomId, engine);
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

      io.to(mapping.roomId).emit('suit-chosen', {
        suit: data.suit,
        playerId: mapping.playerId,
      });

      broadcastGameState(io, mapping.roomId, engine);
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

      broadcastGameState(io, mapping.roomId, engine);
    });

    // ===== REQUEST STATE =====
    socket.on('request-state', () => {
      const mapping = roomManager.getMapping(socket.id);
      if (!mapping) return;

      const room = roomManager.getRoom(mapping.roomId);
      if (!room) return;

      // Send lobby state
      socket.emit('room-updated', roomManager.getRoomInfo(room));

      // Send game state if game is active
      const engine = roomManager.getEngine(mapping.roomId);
      if (engine) {
        socket.emit('game-state', engine.getClientState(mapping.playerId));
      }
    });

    // ===== CHAT =====
    socket.on('chat-message', (data) => {
      const mapping = roomManager.getMapping(socket.id);
      if (!mapping) return;

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
      io.to(result.roomId).emit('player-left', {
        playerId: result.playerId,
        newHostId: result.newHostId,
      });
      io.to(result.roomId).emit('room-updated', roomManager.getRoomInfo(result.room));

      // Update game state for remaining players
      const engine = roomManager.getEngine(result.roomId);
      if (engine) {
        broadcastGameState(io, result.roomId, engine);
      }
    }
  }

  function broadcastGameState(io: TypedServer, roomId: string, engine: ReturnType<RoomManager['getEngine']>) {
    if (!engine) return;
    const room = roomManager.getRoom(roomId);
    if (!room) return;

    for (const player of room.players) {
      const sockets = getPlayerSockets(io, roomId, player.id);
      const clientState = engine.getClientState(player.id);
      for (const sid of sockets) {
        io.to(sid).emit('game-state', clientState);
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
}
