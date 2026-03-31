import { describe, it, expect } from 'vitest';
import { Suit, CardEffect } from 'shared';
import {
  SUIT_SYMBOLS,
  SUIT_COLORS,
  SUIT_LABELS,
  EFFECT_LABELS,
  getCardEffect,
} from '../lib/cardUtils';

describe('cardUtils', () => {
  describe('SUIT_SYMBOLS', () => {
    it('has a symbol for each suit', () => {
      for (const suit of Object.values(Suit)) {
        expect(SUIT_SYMBOLS[suit]).toBeDefined();
        expect(typeof SUIT_SYMBOLS[suit]).toBe('string');
      }
    });
  });

  describe('SUIT_COLORS', () => {
    it('has a hex color for each suit', () => {
      for (const suit of Object.values(Suit)) {
        expect(SUIT_COLORS[suit]).toMatch(/^#[0-9a-fA-F]{6}$/);
      }
    });
  });

  describe('SUIT_LABELS', () => {
    it('has en and ar labels for each suit', () => {
      for (const suit of Object.values(Suit)) {
        expect(SUIT_LABELS[suit].en).toBeDefined();
        expect(SUIT_LABELS[suit].ar).toBeDefined();
      }
    });
  });

  describe('EFFECT_LABELS', () => {
    it('has a label for each effect', () => {
      for (const effect of Object.values(CardEffect)) {
        expect(EFFECT_LABELS[effect]).toBeDefined();
      }
    });

    it('None effect has empty label', () => {
      expect(EFFECT_LABELS[CardEffect.None]).toBe('');
    });
  });

  describe('getCardEffect (client)', () => {
    it('matches shared logic for all special cards', () => {
      expect(getCardEffect({ suit: Suit.Coins, value: 1, id: 'coins-1' })).toBe(CardEffect.DrawFive);
      expect(getCardEffect({ suit: Suit.Cups, value: 2, id: 'cups-2' })).toBe(CardEffect.DrawTwo);
      expect(getCardEffect({ suit: Suit.Swords, value: 10, id: 'swords-10' })).toBe(CardEffect.Skip);
      expect(getCardEffect({ suit: Suit.Clubs, value: 7, id: 'clubs-7' })).toBe(CardEffect.WildSuit);
      expect(getCardEffect({ suit: Suit.Cups, value: 5, id: 'cups-5' })).toBe(CardEffect.None);
    });
  });
});
