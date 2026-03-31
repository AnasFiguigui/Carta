import { describe, it, expect, beforeEach } from 'vitest';
import { useGameStore } from '../lib/store';
import { GamePhase, Suit, Direction, CardEffect } from 'shared';
import type { ClientGameState, PublicPlayer } from 'shared';

function makePlayer(id: string, name: string): PublicPlayer {
  return {
    id,
    name,
    cardCount: 4,
    isConnected: true,
    isReady: false,
    seatIndex: 0,
    avatarId: 'default',
    avatarColor: '#EF4444',
  };
}

function makeGameState(): ClientGameState {
  return {
    roomId: 'ABCDE',
    phase: GamePhase.Playing,
    players: [makePlayer('p1', 'Alice'), makePlayer('p2', 'Bob')],
    myHand: [{ suit: Suit.Cups, value: 3, id: 'cups-3' }],
    myPlayerId: 'p1',
    currentPlayerIndex: 0,
    direction: Direction.Clockwise,
    topCard: { suit: Suit.Cups, value: 5, id: 'cups-5' },
    deckCount: 30,
    discardPileTop3: [],
    pendingDrawAmount: 0,
    forcedSuit: null,
    winnerId: null,
    loserId: null,
    finishedPlayerIds: [],
    kickedPlayerIds: [],
    lastAction: null,
    turnStartedAt: Date.now(),
    turnTimeoutMs: 30000,
    spectators: [],
    hasDrawnThisTurn: false,
  };
}

describe('useGameStore', () => {
  beforeEach(() => {
    useGameStore.getState().reset();
  });

  describe('initial state', () => {
    it('starts at home view', () => {
      expect(useGameStore.getState().view).toBe('home');
    });

    it('has no player id', () => {
      expect(useGameStore.getState().playerId).toBeNull();
    });

    it('has no room id', () => {
      expect(useGameStore.getState().roomId).toBeNull();
    });

    it('has empty players list', () => {
      expect(useGameStore.getState().players).toHaveLength(0);
    });

    it('has sound enabled by default', () => {
      expect(useGameStore.getState().soundEnabled).toBe(true);
    });
  });

  describe('navigation', () => {
    it('setView changes view', () => {
      useGameStore.getState().setView('lobby');
      expect(useGameStore.getState().view).toBe('lobby');
    });
  });

  describe('player identity', () => {
    it('setPlayerId stores id', () => {
      useGameStore.getState().setPlayerId('abc');
      expect(useGameStore.getState().playerId).toBe('abc');
    });

    it('setPlayerName stores name', () => {
      useGameStore.getState().setPlayerName('Alice');
      expect(useGameStore.getState().playerName).toBe('Alice');
    });

    it('setIsSpectator toggles spectator mode', () => {
      useGameStore.getState().setIsSpectator(true);
      expect(useGameStore.getState().isSpectator).toBe(true);
    });

    it('setAvatarId stores avatar', () => {
      useGameStore.getState().setAvatarId('knight');
      expect(useGameStore.getState().avatarId).toBe('knight');
    });
  });

  describe('room state', () => {
    it('setRoomData stores room info', () => {
      const players = [makePlayer('p1', 'Alice')];
      useGameStore.getState().setRoomData('ROOM1', 'p1', players, 6);

      const state = useGameStore.getState();
      expect(state.roomId).toBe('ROOM1');
      expect(state.hostId).toBe('p1');
      expect(state.players).toHaveLength(1);
      expect(state.maxPlayers).toBe(6);
    });
  });

  describe('game state', () => {
    it('setGameState stores full game state', () => {
      const gs = makeGameState();
      useGameStore.getState().setGameState(gs);
      expect(useGameStore.getState().gameState).toEqual(gs);
    });
  });

  describe('effects & animations', () => {
    it('setLastPlayedCard stores card', () => {
      const card = { suit: Suit.Cups, value: 3 as const, id: 'cups-3' };
      useGameStore.getState().setLastPlayedCard(card);
      expect(useGameStore.getState().lastPlayedCard).toEqual(card);
    });

    it('setActiveEffect stores effect', () => {
      const eff = { effect: CardEffect.Skip, targetId: 'p2' };
      useGameStore.getState().setActiveEffect(eff);
      expect(useGameStore.getState().activeEffect).toEqual(eff);
    });

    it('setChosenSuit stores suit', () => {
      useGameStore.getState().setChosenSuit(Suit.Swords);
      expect(useGameStore.getState().chosenSuit).toBe(Suit.Swords);
    });

    it('setCardAnimation stores type and card', () => {
      const card = { suit: Suit.Coins, value: 7 as const, id: 'coins-7' };
      useGameStore.getState().setCardAnimation('draw', card);
      expect(useGameStore.getState().cardAnimationType).toBe('draw');
      expect(useGameStore.getState().animatingCard).toEqual(card);
    });
  });

  describe('chat', () => {
    it('addChatMessage appends messages', () => {
      useGameStore.getState().addChatMessage({
        playerId: 'p1',
        playerName: 'Alice',
        message: 'Hello',
        timestamp: Date.now(),
      });
      expect(useGameStore.getState().chatMessages).toHaveLength(1);
    });

    it('limits chat to ~101 messages', () => {
      for (let i = 0; i < 110; i++) {
        useGameStore.getState().addChatMessage({
          playerId: 'p1',
          playerName: 'Alice',
          message: `msg-${i}`,
          timestamp: Date.now(),
        });
      }
      expect(useGameStore.getState().chatMessages.length).toBeLessThanOrEqual(101);
    });
  });

  describe('connection', () => {
    it('setConnected updates state', () => {
      useGameStore.getState().setConnected(true);
      expect(useGameStore.getState().isConnected).toBe(true);
    });
  });

  describe('reset', () => {
    it('resets all state to defaults', () => {
      useGameStore.getState().setView('game');
      useGameStore.getState().setPlayerId('abc');
      useGameStore.getState().setRoomData('R1', 'p1', [], 6);
      useGameStore.getState().setGameState(makeGameState());
      useGameStore.getState().setConnected(true);

      useGameStore.getState().reset();

      const state = useGameStore.getState();
      expect(state.view).toBe('home');
      expect(state.playerId).toBeNull();
      expect(state.roomId).toBeNull();
      expect(state.gameState).toBeNull();
      expect(state.chatMessages).toHaveLength(0);
    });
  });
});
