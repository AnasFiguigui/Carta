import type { Card, Suit } from 'shared';

/** Client-side mirror of validation logic (for highlighting playable cards) */
export function isValidPlay(
  card: Card,
  topCard: Card,
  forcedSuit: Suit | null,
  pendingDrawAmount: number
): boolean {
  const getEffect = (c: Card) => {
    if (c.value === 1 && c.suit === 'coins') return 'draw_five';
    if (c.value === 2) return 'draw_two';
    if (c.value === 10) return 'skip';
    if (c.value === 7) return 'wild_suit';
    return 'none';
  };

  if (pendingDrawAmount > 0) {
    const topEffect = getEffect(topCard);
    const cardEffect = getEffect(card);

    if (topEffect === 'draw_two' && cardEffect === 'draw_two') return true;
    if (topEffect === 'draw_five' && card.value === 2 && card.suit === 'coins') return true;
    return false;
  }

  if (forcedSuit !== null) {
    if (card.value === 7) return true;
    return card.suit === forcedSuit;
  }

  if (card.suit === topCard.suit) return true;
  if (card.value === topCard.value) return true;
  return false;
}
