import { describe, it, expect } from 'vitest';
import {
  Suit,
  CardEffect,
  Card,
  CARD_VALUES,
  AVATAR_IDS,
  GamePhase,
  Direction,
  ActionType,
  getCardEffect,
  isValidPlay,
} from '../index';

// ===== Helper =====
function card(suit: Suit, value: number): Card {
  return { suit, value: value as Card['value'], id: `${suit}-${value}` };
}

// =====================
// getCardEffect tests
// =====================
describe('getCardEffect', () => {
  it('returns DrawFive for 1 of Coins', () => {
    expect(getCardEffect(card(Suit.Coins, 1))).toBe(CardEffect.DrawFive);
  });

  it('returns DrawTwo for any 2', () => {
    for (const suit of Object.values(Suit)) {
      expect(getCardEffect(card(suit, 2))).toBe(CardEffect.DrawTwo);
    }
  });

  it('returns Skip for any 10 (Sota)', () => {
    for (const suit of Object.values(Suit)) {
      expect(getCardEffect(card(suit, 10))).toBe(CardEffect.Skip);
    }
  });

  it('returns WildSuit for any 7', () => {
    for (const suit of Object.values(Suit)) {
      expect(getCardEffect(card(suit, 7))).toBe(CardEffect.WildSuit);
    }
  });

  it('returns None for normal cards', () => {
    expect(getCardEffect(card(Suit.Cups, 3))).toBe(CardEffect.None);
    expect(getCardEffect(card(Suit.Swords, 5))).toBe(CardEffect.None);
    expect(getCardEffect(card(Suit.Clubs, 6))).toBe(CardEffect.None);
    expect(getCardEffect(card(Suit.Coins, 11))).toBe(CardEffect.None);
    expect(getCardEffect(card(Suit.Coins, 12))).toBe(CardEffect.None);
  });

  it('1 of non-Coins is NOT DrawFive', () => {
    expect(getCardEffect(card(Suit.Cups, 1))).toBe(CardEffect.None);
    expect(getCardEffect(card(Suit.Swords, 1))).toBe(CardEffect.None);
    expect(getCardEffect(card(Suit.Clubs, 1))).toBe(CardEffect.None);
  });
});

// =====================
// isValidPlay tests
// =====================
describe('isValidPlay', () => {
  const topCard = card(Suit.Cups, 5);

  describe('normal play (no pending draw, no forced suit)', () => {
    it('allows same suit', () => {
      expect(isValidPlay(card(Suit.Cups, 3), topCard, null, 0)).toBe(true);
    });

    it('allows same value', () => {
      expect(isValidPlay(card(Suit.Swords, 5), topCard, null, 0)).toBe(true);
    });

    it('rejects different suit and value', () => {
      expect(isValidPlay(card(Suit.Coins, 6), topCard, null, 0)).toBe(false);
    });
  });

  describe('forced suit (after 7 is played)', () => {
    it('allows card of forced suit', () => {
      expect(isValidPlay(card(Suit.Swords, 4), topCard, Suit.Swords, 0)).toBe(true);
    });

    it('rejects card not of forced suit', () => {
      expect(isValidPlay(card(Suit.Cups, 4), topCard, Suit.Swords, 0)).toBe(false);
    });

    it('allows another 7 regardless of suit', () => {
      expect(isValidPlay(card(Suit.Clubs, 7), topCard, Suit.Swords, 0)).toBe(true);
    });
  });

  describe('pending draw amount', () => {
    const topDraw2 = card(Suit.Cups, 2);

    it('allows stacking a 2 on top of a 2', () => {
      expect(isValidPlay(card(Suit.Swords, 2), topDraw2, null, 2)).toBe(true);
    });

    it('rejects non-draw card when draw is pending', () => {
      expect(isValidPlay(card(Suit.Cups, 5), topDraw2, null, 2)).toBe(false);
    });

    it('allows 2 of Coins on top of 1 of Coins (DrawFive)', () => {
      const topDraw5 = card(Suit.Coins, 1);
      expect(isValidPlay(card(Suit.Coins, 2), topDraw5, null, 5)).toBe(true);
    });

    it('rejects stacking non-Coins-2 on DrawFive', () => {
      const topDraw5 = card(Suit.Coins, 1);
      expect(isValidPlay(card(Suit.Cups, 2), topDraw5, null, 5)).toBe(false);
    });

    it('rejects non-2 card on pending draw', () => {
      expect(isValidPlay(card(Suit.Cups, 3), topDraw2, null, 2)).toBe(false);
    });
  });
});

// =====================
// Constants & Enums
// =====================
describe('Constants', () => {
  it('CARD_VALUES has 10 values', () => {
    expect(CARD_VALUES).toHaveLength(10);
    expect(CARD_VALUES).toContain(1);
    expect(CARD_VALUES).toContain(12);
    expect(CARD_VALUES).not.toContain(8);
    expect(CARD_VALUES).not.toContain(9);
  });

  it('AVATAR_IDS has 10 ids', () => {
    expect(AVATAR_IDS).toHaveLength(10);
    expect(AVATAR_IDS).toContain('default');
  });

  it('Suit enum has 4 values', () => {
    expect(Object.values(Suit)).toHaveLength(4);
  });

  it('GamePhase enum has expected values', () => {
    expect(GamePhase.Lobby).toBe('lobby');
    expect(GamePhase.Playing).toBe('playing');
    expect(GamePhase.ChoosingWildSuit).toBe('choosing_wild_suit');
    expect(GamePhase.RoundEnd).toBe('round_end');
    expect(GamePhase.GameOver).toBe('game_over');
  });

  it('Direction has Clockwise and CounterClockwise', () => {
    expect(Direction.Clockwise).toBe(1);
    expect(Direction.CounterClockwise).toBe(-1);
  });

  it('ActionType has expected values', () => {
    expect(ActionType.PlayCard).toBe('play_card');
    expect(ActionType.DrawCard).toBe('draw_card');
    expect(ActionType.ChooseSuit).toBe('choose_suit');
    expect(ActionType.Pass).toBe('pass');
    expect(ActionType.AutoDraw).toBe('auto_draw');
  });
});
