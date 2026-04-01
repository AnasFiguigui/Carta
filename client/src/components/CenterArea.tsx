import React from 'react';
import type { Card as CardType } from 'shared';
import Card from './Card';
import { useGameStore } from '../lib/store';
import { getSocket } from '../lib/socket';

interface CenterAreaProps {
  topCard: CardType | null;
  deckCount: number;
  discardPileTop3: CardType[];
  isMyTurn: boolean;
  pendingDrawAmount: number;
  currentPlayerId: string | undefined;
  myPlayerId: string;
}

export default function CenterArea({
  topCard,
  deckCount,
  discardPileTop3,
  isMyTurn,
  pendingDrawAmount,
  currentPlayerId,
  myPlayerId,
}: Readonly<CenterAreaProps>) {
  const lastPlayedCard = useGameStore((s) => s.lastPlayedCard);
  const gameState = useGameStore((s) => s.gameState);
  let drawTitle = 'Not your turn';
  if (isMyTurn) {
    drawTitle = pendingDrawAmount > 0 ? `Draw ${pendingDrawAmount} cards` : 'Draw a card';
  }

  const handleDrawCard = () => {
    if (!isMyTurn) return;
    getSocket().emit('draw-card');
  };

  return (
    <div className="flex items-center justify-center gap-16">
      {/* Draw Pile (Deck) */}
      <div className="relative">
        <button
          type="button"
          className={`deck-pile relative ${isMyTurn ? 'cursor-pointer' : 'cursor-default'}`}
          onClick={handleDrawCard}
          title={drawTitle}
          disabled={!isMyTurn}
          aria-label={drawTitle}
        >
          {/* Stacked deck visual */}
          {[3, 2, 1, 0].map((offset) => (
            <div
              key={offset}
              className="absolute rounded-lg overflow-hidden"
              style={{
                width: 90,
                height: 135,
                top: -offset * 2,
                left: offset * 1,
                boxShadow: offset === 0 ? '0 4px 12px rgba(0,0,0,0.4)' : 'none',
                zIndex: 4 - offset,
              }}
            >
              <img
                src="/cards/back.webp"
                alt="Card back"
                className="w-full h-full object-cover rounded-lg"
                draggable={false}
              />
            </div>
          ))}
          <div style={{ width: 93, height: 141 }} /> {/* Spacer for stacked cards */}

          {/* Deck count */}
          <div className="absolute -bottom-6 left-1/2 -translate-x-1/2 text-xs text-white/70 whitespace-nowrap">
            {deckCount} cards
          </div>

          {/* Draw indicator when it's your turn */}
          {isMyTurn && (
            <div className="absolute -top-3 left-1/2 -translate-x-1/2 animate-bounce">
              <span className="text-white text-sm">⬇️</span>
            </div>
          )}

          {/* Pending draw amount */}
          {pendingDrawAmount > 0 && (
            <div className="absolute -top-8 left-1/2 -translate-x-1/2 animate-bounce-in">
              <div className={`px-2 py-1 rounded-full text-white text-sm font-bold shadow-lg ${
                currentPlayerId === myPlayerId ? 'bg-red-600' : 'bg-gray-500'
              }`}>
                +{pendingDrawAmount}
              </div>
            </div>
          )}
        </button>
      </div>

      {/* Discard Pile */}
      <div className="relative">
        {/* Previous cards slightly fanned */}
        {discardPileTop3.slice(0, -1).map((card, i) => (
          <div
            key={card.id + i}
            className="absolute"
            style={{
              transform: `rotate(${(i - 1) * 8}deg) translate(${(i - 1) * 3}px, ${(i - 1) * 2}px)`,
              opacity: 0.5,
              zIndex: i,
            }}
          >
            <Card card={card} size="md" />
          </div>
        ))}

        {/* Top card */}
        {topCard && (
          <div
            className={`relative ${lastPlayedCard?.id === topCard.id ? 'card-playing' : ''}`}
            style={{ zIndex: 10 }}
          >
            <Card card={topCard} size="lg" />
          </div>
        )}

        {/* Forced suit indicator */}
        {gameState?.forcedSuit && (
          <div className="absolute -bottom-10 left-1/2 -translate-x-1/2 animate-bounce-in">
            <div
              className="px-3 py-1 rounded-full text-white text-sm font-bold shadow-lg"
              style={{ background: 'rgba(155, 89, 182, 0.9)' }}
            >
              Suit: {gameState.forcedSuit}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
