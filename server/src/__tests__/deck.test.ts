import { describe, it, expect } from 'vitest';
import { createDeck, shuffleDeck, dealCards, findStartingCard } from '../game/deck';
import { Suit, CardEffect, getCardEffect } from 'shared';

describe('createDeck', () => {
  it('creates a 40-card deck', () => {
    const deck = createDeck();
    expect(deck).toHaveLength(40);
  });

  it('contains 10 cards per suit', () => {
    const deck = createDeck();
    for (const suit of Object.values(Suit)) {
      const suitCards = deck.filter(c => c.suit === suit);
      expect(suitCards).toHaveLength(10);
    }
  });

  it('each card has a unique id', () => {
    const deck = createDeck();
    const ids = new Set(deck.map(c => c.id));
    expect(ids.size).toBe(40);
  });

  it('card ids match suit-value format', () => {
    const deck = createDeck();
    for (const card of deck) {
      expect(card.id).toBe(`${card.suit}-${card.value}`);
    }
  });
});

describe('shuffleDeck', () => {
  it('returns same number of cards', () => {
    const deck = createDeck();
    const shuffled = shuffleDeck([...deck]);
    expect(shuffled).toHaveLength(40);
  });

  it('contains the same cards (just reordered)', () => {
    const deck = createDeck();
    const copy = [...deck];
    shuffleDeck(copy);
    const originalIds = deck.map(c => c.id).sort((a, b) => a.localeCompare(b));
    const shuffledIds = copy.map(c => c.id).sort((a, b) => a.localeCompare(b));
    expect(shuffledIds).toEqual(originalIds);
  });

  it('mutates the array in-place', () => {
    const deck = createDeck();
    const ref = deck;
    shuffleDeck(deck);
    expect(deck).toBe(ref);
  });
});

describe('dealCards', () => {
  it('deals correct number of cards to each player', () => {
    const deck = createDeck();
    shuffleDeck(deck);
    const hands = dealCards(deck, 4, 4);
    expect(hands).toHaveLength(4);
    for (const hand of hands) {
      expect(hand).toHaveLength(4);
    }
  });

  it('removes dealt cards from deck', () => {
    const deck = createDeck();
    const originalLen = deck.length;
    dealCards(deck, 3, 7);
    expect(deck).toHaveLength(originalLen - 21);
  });

  it('deals 7 cards by default', () => {
    const deck = createDeck();
    const hands = dealCards(deck, 2);
    for (const hand of hands) {
      expect(hand).toHaveLength(7);
    }
  });
});

describe('findStartingCard', () => {
  it('finds a non-special card', () => {
    const deck = createDeck();
    const result = findStartingCard(deck);
    expect(result).not.toBeNull();
    if (!result) return;
    const effect = getCardEffect(result.card);
    expect(effect).toBe(CardEffect.None);
  });

  it('returns the index within the deck', () => {
    const deck = createDeck();
    const result = findStartingCard(deck);
    expect(result).not.toBeNull();
    if (!result) return;
    expect(deck[result.index]).toEqual(result.card);
  });

  it('returns null for a deck of only special cards', () => {
    // Build a deck of only 2s (DrawTwo – special)
    const specialDeck = Object.values(Suit).map(suit => ({
      suit,
      value: 2 as const,
      id: `${suit}-2`,
    }));
    const result = findStartingCard(specialDeck);
    expect(result).toBeNull();
  });
});
