import {
  Card,
  CardValue,
  Suit,
  CARD_VALUES,
  CardEffect,
} from 'shared';

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

/** Determine the effect of a card */
export function getCardEffect(card: Card): CardEffect {
  // 1 of Coins → Draw Five
  if (card.value === 1 && card.suit === Suit.Coins) {
    return CardEffect.DrawFive;
  }
  // All 2s → Draw Two
  if (card.value === 2) {
    return CardEffect.DrawTwo;
  }
  // All 10s (Sota/Jack) → Skip
  if (card.value === 10) {
    return CardEffect.Skip;
  }
  // All 7s → Wild Suit
  if (card.value === 7) {
    return CardEffect.WildSuit;
  }
  return CardEffect.None;
}

/**
 * Check if a card can be played given the top card and game state.
 * @param card The card to play
 * @param topCard The current top card on the discard pile
 * @param forcedSuit If a 7 was played, the suit that was chosen
 * @param pendingDrawAmount If there's a pending draw stack
 */
export function isValidPlay(
  card: Card,
  topCard: Card,
  forcedSuit: Suit | null,
  pendingDrawAmount: number
): boolean {
  // If there's a pending draw amount, only draw cards can be played to stack
  if (pendingDrawAmount > 0) {
    const topEffect = getCardEffect(topCard);
    const cardEffect = getCardEffect(card);

    // If top effect is DrawTwo, can stack with another DrawTwo
    if (topEffect === CardEffect.DrawTwo && cardEffect === CardEffect.DrawTwo) {
      return true;
    }
    // If top effect is DrawFive (1 of Coins), can only stack with 2 of Coins
    if (topEffect === CardEffect.DrawFive && card.value === 2 && card.suit === Suit.Coins) {
      return true;
    }
    // No other cards can be played during a pending draw
    return false;
  }

  // If a forced suit is active (from a 7), must match that suit OR play another 7
  if (forcedSuit !== null) {
    if (card.value === 7) return true; // 7s can always be played as wild
    return card.suit === forcedSuit;
  }

  // Normal play: match suit or value
  if (card.suit === topCard.suit) return true;
  if (card.value === topCard.value) return true;

  // 7s are conditional wild: can only be played if matching suit or value (already covered above)
  return false;
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


