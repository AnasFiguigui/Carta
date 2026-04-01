import { Suit, Card, CardEffect } from 'shared';

export const SUIT_SYMBOLS: Record<Suit, string> = {
  [Suit.Cups]: '🏆',
  [Suit.Swords]: '⚔️',
  [Suit.Clubs]: '🏏',
  [Suit.Coins]: '🪙',
};

export const SUIT_ICONS: Record<Suit, string> = {
  [Suit.Cups]: '/symbols/cups.webp',
  [Suit.Swords]: '/symbols/swords.webp',
  [Suit.Clubs]: '/symbols/clubs.webp',
  [Suit.Coins]: '/symbols/coins.webp',
};

export const SUIT_COLORS: Record<Suit, string> = {
  [Suit.Cups]: '#e74c3c',
  [Suit.Swords]: '#3498db',
  [Suit.Clubs]: '#27ae60',
  [Suit.Coins]: '#f1c40f',
};

export const SUIT_LABELS: Record<Suit, { en: string; ar: string }> = {
  [Suit.Cups]: { en: 'Cups', ar: 'كؤوس' },
  [Suit.Swords]: { en: 'Swords', ar: 'سيوف' },
  [Suit.Clubs]: { en: 'Clubs', ar: 'عصي' },
  [Suit.Coins]: { en: 'Coins', ar: 'دراهم' },
};

export const EFFECT_LABELS: Record<CardEffect, string> = {
  [CardEffect.None]: '',
  [CardEffect.Skip]: '⛔ SKIP',
  [CardEffect.WildSuit]: '🎨 WILD',
  [CardEffect.DrawTwo]: '+2',
  [CardEffect.DrawFive]: '+5',
};

export function getCardEffect(card: Card): CardEffect {
  if (card.value === 1 && card.suit === Suit.Coins) return CardEffect.DrawFive;
  if (card.value === 2) return CardEffect.DrawTwo;
  if (card.value === 10) return CardEffect.Skip;
  if (card.value === 7) return CardEffect.WildSuit;
  return CardEffect.None;
}


