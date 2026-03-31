import {
  Card,
  Suit,
  CARD_VALUES,
  CardEffect,
  getCardEffect,
} from 'shared';

// Re-export shared logic so existing imports from deck.ts still work
export { getCardEffect, isValidPlay } from 'shared';

/** Build a fresh 40-card deck */
export function createDeck(): Card[] {
  const deck: Card[] = [];
  const suits = Object.values(Suit);
  for (const suit of suits) {
    for (const value of CARD_VALUES) {
      deck.push({ suit, value, id: `${suit}-${value}` });
    }
  }
  return deck;
}

/** Fisher–Yates shuffle (in-place) */
export function shuffleDeck(deck: Card[]): Card[] {
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}

/** Deal cards from the deck to players */
export function dealCards(deck: Card[], playerCount: number, cardsPerPlayer: number = 7): Card[][] {
  const hands: Card[][] = [];
  for (let i = 0; i < playerCount; i++) {
    hands.push(deck.splice(0, cardsPerPlayer));
  }
  return hands;
}

/** Find a suitable starting card (not a special card) */
export function findStartingCard(deck: Card[]): { card: Card; index: number } | null {
  for (let i = 0; i < deck.length; i++) {
    const effect = getCardEffect(deck[i]);
    if (effect === CardEffect.None) {
      return { card: deck[i], index: i };
    }
  }
  return null;
}


