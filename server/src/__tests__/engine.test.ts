import { describe, it, expect, beforeEach } from 'vitest';
import { GameEngine } from '../game/engine';
import {
  Player,
  Suit,
  GamePhase,
  CardEffect,
  Direction,
  Card,
} from 'shared';

function makePlayers(count: number): Player[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `player-${i}`,
    name: `Player ${i}`,
    hand: [],
    cardCount: 0,
    isConnected: true,
    isReady: true,
    seatIndex: i,
    avatarId: 'default' as const,
    avatarColor: '#EF4444',
  }));
}

function setupWildSuit(engine: GameEngine): void {
  const current = engine.getCurrentPlayer();
  const topCard = engine.getState().topCard;
  if (!topCard) return;
  const wild: Card = { suit: topCard.suit, value: 7, id: `${topCard.suit}-7-test` };
  current.hand.push(wild, { suit: Suit.Cups, value: 3, id: 'filler' });
  current.cardCount = current.hand.length;
  engine.playCard(current.id, wild.id);
}

describe('GameEngine', () => {
  let engine: GameEngine;

  beforeEach(() => {
    engine = new GameEngine('room-1', makePlayers(3));
    engine.startGame();
  });

  describe('startGame', () => {
    it('sets phase to Playing', () => {
      expect(engine.getState().phase).toBe(GamePhase.Playing);
    });

    it('deals 4 cards to each player', () => {
      for (const player of engine.getState().players) {
        expect(player.hand).toHaveLength(4);
        expect(player.cardCount).toBe(4);
      }
    });

    it('sets a non-special top card', () => {
      const top = engine.getState().topCard;
      expect(top).not.toBeNull();
    });

    it('initializes direction as Clockwise', () => {
      expect(engine.getState().direction).toBe(Direction.Clockwise);
    });

    it('has no pending draw at start', () => {
      expect(engine.getState().pendingDrawAmount).toBe(0);
    });

    it('has no forced suit at start', () => {
      expect(engine.getState().forcedSuit).toBeNull();
    });

    it('has deck with remaining cards', () => {
      const state = engine.getState();
      expect(state.deck.length).toBeGreaterThanOrEqual(25);
    });
  });

  describe('getClientState', () => {
    it('includes player hand only for the requesting player', () => {
      const state = engine.getState();
      const p0 = state.players[0];
      const clientState = engine.getClientState(p0.id);

      expect(clientState.myPlayerId).toBe(p0.id);
      expect(clientState.myHand).toHaveLength(p0.hand.length);
      for (const pp of clientState.players) {
        expect(pp).not.toHaveProperty('hand');
      }
    });

    it('includes deck count not actual deck', () => {
      const clientState = engine.getClientState('player-0');
      expect(clientState.deckCount).toBeGreaterThan(0);
      expect(clientState).not.toHaveProperty('deck');
    });

    it('includes spectators passed in', () => {
      const specs = [{ id: 's1', name: 'Spec', avatarId: 'default' as const, avatarColor: '#000' }];
      const clientState = engine.getClientState('player-0', specs);
      expect(clientState.spectators).toHaveLength(1);
    });
  });

  describe('playCard', () => {
    it('rejects play from non-current player', () => {
      const current = engine.getCurrentPlayer();
      const other = engine.getState().players.find(p => p.id !== current.id);
      expect(other).toBeDefined();
      if (!other) return;
      const result = engine.playCard(other.id, 'any-card');
      expect(result.success).toBe(false);
      expect(result.error).toBe('Not your turn');
    });

    it('rejects card not in hand', () => {
      const current = engine.getCurrentPlayer();
      const result = engine.playCard(current.id, 'nonexistent-card');
      expect(result.success).toBe(false);
      expect(result.error).toBe('Card not in your hand');
    });

    it('rejects invalid play (wrong suit and value)', () => {
      const current = engine.getCurrentPlayer();
      const topCard = engine.getState().topCard;
      if (!topCard) return;

      const badCard = current.hand.find(
        c => c.suit !== topCard.suit && c.value !== topCard.value && c.value !== 7
      );
      if (badCard) {
        const result = engine.playCard(current.id, badCard.id);
        expect(result.success).toBe(false);
        expect(result.error).toBe('Invalid play');
      }
    });

    it('accepts valid play (same suit)', () => {
      const current = engine.getCurrentPlayer();
      const topCard = engine.getState().topCard;
      if (!topCard) return;

      const validCard: Card = { suit: topCard.suit, value: 3, id: `${topCard.suit}-3-test` };
      current.hand.push(validCard);
      current.cardCount = current.hand.length;

      const result = engine.playCard(current.id, validCard.id);
      expect(result.success).toBe(true);
      expect(result.card).toEqual(validCard);
    });

    it('enters ChoosingWildSuit phase when 7 is played', () => {
      const current = engine.getCurrentPlayer();
      const topCard = engine.getState().topCard;
      if (!topCard) return;

      const wild: Card = { suit: topCard.suit, value: 7, id: `${topCard.suit}-7-test` };
      current.hand.push(wild, { suit: Suit.Cups, value: 3, id: 'filler' });
      current.cardCount = current.hand.length;

      const result = engine.playCard(current.id, wild.id);
      expect(result.success).toBe(true);
      expect(result.effect).toBe(CardEffect.WildSuit);
      expect(engine.getState().phase).toBe(GamePhase.ChoosingWildSuit);
    });

    it('Skip effect advances turn twice', () => {
      const current = engine.getCurrentPlayer();
      const topCard = engine.getState().topCard;
      if (!topCard) return;
      const currentIndex = engine.getState().currentPlayerIndex;

      const skip: Card = { suit: topCard.suit, value: 10, id: `${topCard.suit}-10-test` };
      current.hand.push(skip);
      current.cardCount = current.hand.length;

      const result = engine.playCard(current.id, skip.id);
      expect(result.success).toBe(true);
      expect(result.effect).toBe(CardEffect.Skip);
      expect(engine.getState().currentPlayerIndex).not.toBe(currentIndex);
    });

    it('DrawTwo adds 2 to pendingDrawAmount', () => {
      const current = engine.getCurrentPlayer();
      const topCard = engine.getState().topCard;
      if (!topCard) return;

      const draw2: Card = { suit: topCard.suit, value: 2, id: `${topCard.suit}-2-test` };
      current.hand.push(draw2);
      current.cardCount = current.hand.length;

      const result = engine.playCard(current.id, draw2.id);
      expect(result.success).toBe(true);
      expect(result.effect).toBe(CardEffect.DrawTwo);
      expect(engine.getState().pendingDrawAmount).toBe(2);
    });
  });

  describe('chooseSuit', () => {
    it('sets forcedSuit and returns to Playing', () => {
      setupWildSuit(engine);
      const current = engine.getCurrentPlayer();
      const result = engine.chooseSuit(current.id, Suit.Swords);

      expect(result.success).toBe(true);
      expect(engine.getState().forcedSuit).toBe(Suit.Swords);
      expect(engine.getState().phase).toBe(GamePhase.Playing);
    });

    it('rejects when not in ChoosingWildSuit phase', () => {
      const result = engine.chooseSuit('player-0', Suit.Cups);
      expect(result.success).toBe(false);
    });

    it('rejects from non-current player', () => {
      setupWildSuit(engine);
      const current = engine.getCurrentPlayer();
      const other = engine.getState().players.find(p => p.id !== current.id);
      expect(other).toBeDefined();
      if (!other) return;
      const result = engine.chooseSuit(other.id, Suit.Cups);
      expect(result.success).toBe(false);
    });
  });

  describe('drawCard', () => {
    it('draws 1 card normally', () => {
      const current = engine.getCurrentPlayer();
      const result = engine.drawCard(current.id);

      expect(result.success).toBe(true);
      expect(result.drawnCards).toHaveLength(1);
    });

    it('draws pending amount when pendingDrawAmount > 0', () => {
      const state = engine.getState();
      state.pendingDrawAmount = 4;

      const current = engine.getCurrentPlayer();
      const result = engine.drawCard(current.id);

      expect(result.success).toBe(true);
      expect(result.drawnCards).toHaveLength(4);
      expect(engine.getState().pendingDrawAmount).toBe(0);
    });

    it('rejects from non-current player', () => {
      const current = engine.getCurrentPlayer();
      const other = engine.getState().players.find(p => p.id !== current.id);
      expect(other).toBeDefined();
      if (!other) return;
      const result = engine.drawCard(other.id);
      expect(result.success).toBe(false);
    });

    it('rejects when not in playing phase', () => {
      engine.getState().phase = GamePhase.Lobby;
      const result = engine.drawCard('player-0');
      expect(result.success).toBe(false);
    });
  });

  describe('passTurn', () => {
    it('advances turn', () => {
      const currentIdx = engine.getState().currentPlayerIndex;
      const current = engine.getCurrentPlayer();
      const result = engine.passTurn(current.id);

      expect(result.success).toBe(true);
      expect(engine.getState().currentPlayerIndex).not.toBe(currentIdx);
    });

    it('auto-draws if player has not drawn this turn', () => {
      const current = engine.getCurrentPlayer();
      const result = engine.passTurn(current.id);

      expect(result.success).toBe(true);
      expect(result.drawnCards).toHaveLength(1);
    });

    it('rejects from non-current player', () => {
      const current = engine.getCurrentPlayer();
      const other = engine.getState().players.find(p => p.id !== current.id);
      expect(other).toBeDefined();
      if (!other) return;
      const result = engine.passTurn(other.id);
      expect(result.success).toBe(false);
    });
  });

  describe('disconnectPlayer', () => {
    it('marks player as disconnected', () => {
      engine.disconnectPlayer('player-0');
      const p = engine.getState().players.find(pl => pl.id === 'player-0');
      expect(p).toBeDefined();
      expect(p?.isConnected).toBe(false);
    });

    it('advances turn if disconnected player was current', () => {
      const current = engine.getCurrentPlayer();
      const currentIdx = engine.getState().currentPlayerIndex;
      engine.disconnectPlayer(current.id);
      expect(engine.getState().currentPlayerIndex).not.toBe(currentIdx);
    });
  });

  describe('reconnectPlayer', () => {
    it('marks player as connected', () => {
      engine.disconnectPlayer('player-1');
      const p1Before = engine.getState().players.find(p => p.id === 'player-1');
      expect(p1Before?.isConnected).toBe(false);
      engine.reconnectPlayer('player-1');
      const p1After = engine.getState().players.find(p => p.id === 'player-1');
      expect(p1After?.isConnected).toBe(true);
    });
  });

  describe('kickPlayer', () => {
    it('marks player as finished and kicked', () => {
      engine.kickPlayer('player-1');
      expect(engine.getState().finishedPlayerIds).toContain('player-1');
      expect(engine.getState().kickedPlayerIds).toContain('player-1');
    });

    it('returns player cards to deck', () => {
      const p = engine.getState().players.find(pl => pl.id === 'player-1');
      expect(p).toBeDefined();
      if (!p) return;
      const cardsInHand = p.hand.length;
      const deckBefore = engine.getState().deck.length;
      engine.kickPlayer('player-1');
      expect(engine.getState().deck.length).toBe(deckBefore + cardsInHand);
      expect(p.hand).toHaveLength(0);
    });

    it('ends game when only 1 player remains', () => {
      engine.kickPlayer('player-1');
      const result = engine.kickPlayer('player-2');
      expect(result.gameOver).toBe(true);
      expect(engine.getState().phase).toBe(GamePhase.GameOver);
    });
  });

  describe('autoDrawCard', () => {
    it('draws pending amount or 1 as penalty', () => {
      const result = engine.autoDrawCard();
      expect(result.success).toBe(true);
      expect(result.drawnCount).toBeGreaterThanOrEqual(1);
    });

    it('advances turn after auto-draw', () => {
      const currentIdx = engine.getState().currentPlayerIndex;
      engine.autoDrawCard();
      expect(engine.getState().currentPlayerIndex).not.toBe(currentIdx);
    });

    it('auto-chooses suit if in ChoosingWildSuit phase', () => {
      const current = engine.getCurrentPlayer();
      const topCard = engine.getState().topCard;
      if (!topCard) return;
      const wild: Card = { suit: topCard.suit, value: 7, id: `${topCard.suit}-7-test` };
      current.hand.push(wild, { suit: Suit.Cups, value: 3, id: 'filler' });
      current.cardCount = current.hand.length;
      engine.playCard(current.id, wild.id);
      expect(engine.getState().phase).toBe(GamePhase.ChoosingWildSuit);

      const result = engine.autoDrawCard();
      expect(result.success).toBe(true);
      expect(engine.getState().forcedSuit).not.toBeNull();
      expect(engine.getState().phase).toBe(GamePhase.Playing);
    });
  });

  describe('playCard — win/game-over', () => {
    it('sets winnerId when player empties hand', () => {
      const current = engine.getCurrentPlayer();
      const topCard = engine.getState().topCard;
      if (!topCard) return;

      // Clear hand and add one valid card
      current.hand = [{ suit: topCard.suit, value: 3, id: `${topCard.suit}-3-win` }];
      current.cardCount = 1;

      const result = engine.playCard(current.id, `${topCard.suit}-3-win`);
      expect(result.success).toBe(true);
      expect(result.playerFinished).toBe(true);
      expect(engine.getState().winnerId).toBe(current.id);
      expect(engine.getState().finishedPlayerIds).toContain(current.id);
    });

    it('triggers GameOver when ≤1 active player remains', () => {
      const state = engine.getState();
      const topCard = state.topCard;
      if (!topCard) return;

      // Finish player-1 and player-2 first
      state.finishedPlayerIds.push('player-1', 'player-2');

      // Let the current player be the remaining one
      const remaining = state.players.find(p => !state.finishedPlayerIds.includes(p.id));
      if (!remaining) return;
      state.currentPlayerIndex = state.players.indexOf(remaining);

      // Give them one playable card
      remaining.hand = [{ suit: topCard.suit, value: 4, id: `${topCard.suit}-4-last` }];
      remaining.cardCount = 1;

      const result = engine.playCard(remaining.id, `${topCard.suit}-4-last`);
      expect(result.success).toBe(true);
      expect(result.playerFinished).toBe(true);
      expect(engine.getState().phase).toBe(GamePhase.GameOver);
    });
  });

  describe('playCard — DrawFive effect', () => {
    it('adds 5 to pendingDrawAmount for 1 of Coins', () => {
      const current = engine.getCurrentPlayer();
      const topCard = engine.getState().topCard;
      if (!topCard) return;

      // Force top card to Coins so Coins-1 is valid
      engine.getState().topCard = { suit: Suit.Coins, value: 5, id: 'coins-5-forced' };
      engine.getState().discardPile.push(engine.getState().topCard!);

      const draw5: Card = { suit: Suit.Coins, value: 1, id: 'coins-1-test' };
      current.hand.push(draw5);
      current.cardCount = current.hand.length;

      const result = engine.playCard(current.id, draw5.id);
      expect(result.success).toBe(true);
      expect(result.effect).toBe(CardEffect.DrawFive);
      expect(engine.getState().pendingDrawAmount).toBe(5);
    });
  });

  describe('playCard — WildSuit auto-advance when finished', () => {
    it('auto-advances when finished player plays a 7', () => {
      const current = engine.getCurrentPlayer();
      const topCard = engine.getState().topCard;
      if (!topCard) return;

      // Only card is a 7 matching top card suit
      current.hand = [{ suit: topCard.suit, value: 7, id: `${topCard.suit}-7-finish` }];
      current.cardCount = 1;

      const result = engine.playCard(current.id, `${topCard.suit}-7-finish`);
      expect(result.success).toBe(true);
      expect(result.playerFinished).toBe(true);
      // Should NOT enter ChoosingWildSuit since player finished
      expect(engine.getState().phase).not.toBe(GamePhase.ChoosingWildSuit);
    });
  });

  describe('chooseSuit — invalid suit', () => {
    it('rejects invalid suit value', () => {
      setupWildSuit(engine);
      const current = engine.getCurrentPlayer();
      const result = engine.chooseSuit(current.id, 'invalid' as Suit);
      expect(result.success).toBe(false);
      expect(result.error).toBe('Invalid suit');
    });
  });

  describe('drawCard — double draw guard', () => {
    it('rejects draw when hasDrawnThisTurn is true', () => {
      const current = engine.getCurrentPlayer();
      // Manually set the flag (normally draw advances turn, resetting it)
      engine.getState().hasDrawnThisTurn = true;

      const result = engine.drawCard(current.id);
      expect(result.success).toBe(false);
      expect(result.error).toBe('Already drawn this turn');
    });
  });

  describe('passTurn — after drawing', () => {
    it('does not auto-draw if player already drew this turn', () => {
      const current = engine.getCurrentPlayer();
      const handBefore = current.hand.length;

      // Draw first
      engine.drawCard(current.id);
      expect(current.hand.length).toBe(handBefore + 1);

      // Pass — should NOT draw again
      const handAfterDraw = current.hand.length;
      engine.passTurn(current.id);
      // Hand should stay same (passTurn doesn't draw when hasDrawnThisTurn is true)
      expect(current.hand.length).toBe(handAfterDraw);
    });
  });

  describe('disconnectPlayer — during ChoosingWildSuit', () => {
    it('auto-chooses suit and advances turn', () => {
      setupWildSuit(engine);
      expect(engine.getState().phase).toBe(GamePhase.ChoosingWildSuit);

      const current = engine.getCurrentPlayer();
      engine.disconnectPlayer(current.id);

      expect(engine.getState().phase).toBe(GamePhase.Playing);
      expect(engine.getState().forcedSuit).not.toBeNull();
    });
  });

  describe('getConnectedActiveCount', () => {
    it('returns count of connected non-finished players', () => {
      expect(engine.getConnectedActiveCount()).toBe(3);
      engine.disconnectPlayer('player-1');
      expect(engine.getConnectedActiveCount()).toBe(2);
    });
  });
});
