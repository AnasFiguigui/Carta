import { useEffect, useRef } from 'react';
import { connectSocket } from './socket';
import { useGameStore } from './store';
import { playSound } from './sounds';

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
      // On reconnect, try to rejoin with stored credentials so the new socket gets mapped
      const { roomId, playerId } = getState();
      if (roomId && playerId) {
        socket.emit('rejoin', { roomId, playerId }, (res) => {
          if (!res.success) {
            // Fallback: request-state might work if mapping still exists
            socket.emit('request-state');
          }
        });
      }
    });

    socket.on('disconnect', () => {
      getState().setConnected(false);
    });

    // When user returns to the tab, re-request state in case we missed updates
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && socket.connected) {
        const { roomId, playerId } = getState();
        if (roomId && playerId) {
          socket.emit('rejoin', { roomId, playerId }, (res) => {
            if (!res.success) {
              socket.emit('request-state');
            }
          });
        }
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    socket.on('room-updated', (data) => {
      getState().setRoomData(data.id, data.hostId, data.players, data.maxPlayers, (data as any).spectators);

      // If phase changed from lobby to playing, switch view
      if (data.phase !== 'lobby' && getState().view === 'lobby') {
        getState().setView('game');
      }
      // If game is over and goes back to lobby
      if (data.phase === 'lobby' && getState().view === 'game') {
        getState().setView('lobby');
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

    socket.on('card-drawn', (data) => {
      // Trigger draw animation only for the local player
      if (data.playerId === getState().playerId && data.drawnCards && data.drawnCards.length > 0) {
        getState().setCardAnimation('draw', data.drawnCards[0]);
        setTimeout(() => getState().setCardAnimation(null), 500);
      }
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

    socket.on('player-left', (data) => {
      getState().addChatMessage({
        playerId: 'system',
        playerName: 'System',
        message: `A player left the room`,
        timestamp: Date.now(),
        isSystem: true,
      });
    });

    socket.on('spectator-joined', (spectator) => {
      getState().addChatMessage({
        playerId: 'system',
        playerName: 'System',
        message: `👁 ${spectator.name} is now spectating`,
        timestamp: Date.now(),
        isSystem: true,
      });
    });

    socket.on('spectator-left', (data) => {
      getState().addChatMessage({
        playerId: 'system',
        playerName: 'System',
        message: `A spectator left`,
        timestamp: Date.now(),
        isSystem: true,
      });
    });

    socket.on('timer-expired', (data) => {
      getState().setTimerExpiredPlayerId(data.playerId);
      setTimeout(() => getState().setTimerExpiredPlayerId(null), 3000);
    });

    socket.on('auto-draw', (data) => {
      getState().setAutoDrawPlayerId(data.playerId);
      setTimeout(() => getState().setAutoDrawPlayerId(null), 1000);
    });

    socket.on('turn-changed', () => {
      // Game state update will follow via game-state event with new turnStartedAt
    });

    socket.on('sound', (data) => {
      if (getState().soundEnabled) {
        playSound(data.sound);
      }
    });

    socket.on('chat-message', (data) => {
      getState().addChatMessage({
        ...data,
        timestamp: Date.now(),
      });
    });

    socket.on('error', (data) => {
      console.error('Server error:', data.message);
      if (data.message === 'You have been kicked from the room') {
        getState().reset();
      }
    });

    // No cleanup — listeners must survive React StrictMode's
    // unmount/remount cycle. The initialized ref prevents duplicates.
  }, []);
}
