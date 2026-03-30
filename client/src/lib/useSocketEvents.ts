import { useEffect, useRef } from 'react';
import { connectSocket } from './socket';
import { useGameStore } from './store';

/** Always read latest store state inside socket handlers (avoids stale closures) */
const getState = () => useGameStore.getState();

export function useSocketEvents() {
  const initialized = useRef(false);

  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;

    const socket = connectSocket();

    socket.on('connect', () => {
      getState().setConnected(true);
      // Re-request state on reconnect
      if (getState().roomId) {
        socket.emit('request-state');
      }
    });

    socket.on('disconnect', () => {
      getState().setConnected(false);
    });

    socket.on('room-updated', (data) => {
      getState().setRoomData(data.id, data.hostId, data.players, data.maxPlayers);

      // If phase changed from lobby to playing, switch view
      if (data.phase !== 'lobby' && getState().view === 'lobby') {
        getState().setView('game');
      }
    });

    socket.on('game-state', (state) => {
      getState().setGameState(state);
      if (state.phase !== 'lobby' && getState().view !== 'game') {
        getState().setView('game');
      }
    });

    socket.on('card-played', (data) => {
      getState().setLastPlayedCard(data.card);
      setTimeout(() => getState().setLastPlayedCard(null), 600);
    });

    socket.on('effect-applied', (data) => {
      getState().setActiveEffect({
        effect: data.effect,
        targetId: data.targetPlayerId,
        amount: data.amount,
      });
      setTimeout(() => getState().setActiveEffect(null), 2000);
    });

    socket.on('suit-chosen', (data) => {
      getState().setChosenSuit(data.suit);
      setTimeout(() => getState().setChosenSuit(null), 2000);
    });

    socket.on('game-over', (data) => {
      getState().addChatMessage({
        playerId: 'system',
        playerName: 'System',
        message: `🎉 ${data.winnerName} wins the game!`,
        timestamp: Date.now(),
        isSystem: true,
      });
    });

    socket.on('player-joined', (player) => {
      getState().addChatMessage({
        playerId: 'system',
        playerName: 'System',
        message: `${player.name} joined the room`,
        timestamp: Date.now(),
        isSystem: true,
      });
    });

    socket.on('player-left', () => {
      getState().addChatMessage({
        playerId: 'system',
        playerName: 'System',
        message: `A player left the room`,
        timestamp: Date.now(),
        isSystem: true,
      });
    });

    socket.on('chat-message', (data) => {
      getState().addChatMessage({
        ...data,
        timestamp: Date.now(),
      });
    });

    socket.on('error', (data) => {
      console.error('Server error:', data.message);
    });

    // No cleanup — listeners must survive React StrictMode's
    // unmount/remount cycle. The initialized ref prevents duplicates.
  }, []);
}
