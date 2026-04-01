import React from 'react';
import type { Card as CardType } from 'shared';
import Card from './Card';
import { getSocket } from '../lib/socket';
import { useGameStore } from '../lib/store';

interface PlayerHandProps {
  cards: CardType[];
  playableCardIds: Set<string>;
  isMyTurn: boolean;
}

export default function PlayerHand({ cards, playableCardIds, isMyTurn }: Readonly<PlayerHandProps>) {
  const isMobile = globalThis.innerWidth < 768;
  const cardSize = isMobile ? 'sm' as const : 'md' as const;
  const cardW = isMobile ? 60 : 90;

  const handlePlayCard = (card: CardType) => {
    if (!isMyTurn) return;
    if (!playableCardIds.has(card.id)) return;
    useGameStore.getState().setCardAnimation('play', card);
    setTimeout(() => useGameStore.getState().setCardAnimation(null), 500);
    getSocket().emit('play-card', { cardId: card.id });
  };

  // Fan out cards with overlap - adapt to screen width
  const maxSpread = isMobile ? Math.min(globalThis.innerWidth - 40, 350) : 700;
  const baseSpacing = isMobile ? 45 : 70;
  const totalWidth = Math.min(cards.length * baseSpacing, maxSpread);
  const cardSpacing = cards.length > 1 ? totalWidth / (cards.length - 1) : 0;
  const handHeight = isMobile ? 120 : 170;
  const innerHeight = isMobile ? 110 : 160;

  return (
    <div className="relative flex items-end justify-center" style={{ height: handHeight, minWidth: isMobile ? 120 : 200 }}>
      <div className="relative" style={{ width: totalWidth + cardW, height: innerHeight }}>
        {cards.map((card, i) => {
          const isPlayable = isMyTurn && playableCardIds.has(card.id);
          // Slight arc effect
          const progress = cards.length > 1 ? (i / (cards.length - 1)) * 2 - 1 : 0;
          const rotation = progress * (isMobile ? 5 : 8);
          const yOffset = Math.abs(progress) * (isMobile ? 8 : 15);

          return (
            <div
              key={card.id}
              className="absolute bottom-0"
              style={{
                left: cards.length > 1 ? i * cardSpacing : totalWidth / 2,
                transform: `rotate(${rotation}deg) translateY(${yOffset}px)`,
                zIndex: i,
                transition: 'left 0.3s ease, transform 0.3s ease',
              }}
            >
              <Card
                card={card}
                isPlayable={isPlayable}
                onClick={() => handlePlayCard(card)}
                size={cardSize}
                animDelay={i * 50}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}
