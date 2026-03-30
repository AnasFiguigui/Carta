import React from 'react';
import type { Card as CardType } from 'shared';
import Card from './Card';
import { getSocket } from '../lib/socket';

interface PlayerHandProps {
  cards: CardType[];
  playableCardIds: Set<string>;
  isMyTurn: boolean;
}

export default function PlayerHand({ cards, playableCardIds, isMyTurn }: PlayerHandProps) {

  const handlePlayCard = (cardId: string) => {
    if (!isMyTurn) return;
    if (!playableCardIds.has(cardId)) return;
    getSocket().emit('play-card', { cardId });
  };

  // Fan out cards with overlap
  const totalWidth = Math.min(cards.length * 70, 700);
  const cardSpacing = cards.length > 1 ? totalWidth / (cards.length - 1) : 0;

  return (
    <div className="relative flex items-end justify-center" style={{ height: 170, minWidth: 200 }}>
      <div className="relative" style={{ width: totalWidth + 90, height: 160 }}>
        {cards.map((card, i) => {
          const isPlayable = isMyTurn && playableCardIds.has(card.id);
          // Slight arc effect
          const progress = cards.length > 1 ? (i / (cards.length - 1)) * 2 - 1 : 0;
          const rotation = progress * 8; // up to ±8 degrees
          const yOffset = Math.abs(progress) * 15; // arc up at edges

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
                onClick={() => handlePlayCard(card.id)}
                size="md"
                animDelay={i * 50}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}
