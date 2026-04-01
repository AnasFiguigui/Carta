import React, { useState, useCallback } from 'react';
import type { Card as CardType } from 'shared';
import { getCardEffect, EFFECT_LABELS } from '../lib/cardUtils';

interface CardProps {
  card: CardType;
  isPlayable?: boolean;
  isFaceDown?: boolean;
  onClick?: () => void;
  size?: 'sm' | 'md' | 'lg';
  style?: React.CSSProperties;
  className?: string;
  animDelay?: number;
}

const SIZES = {
  sm: { w: 60, h: 90 },
  md: { w: 90, h: 135 },
  lg: { w: 110, h: 165 },
};

function getCardImagePath(card: CardType): string {
  return `/cards/${card.value}${card.suit}.webp`;
}

export default function Card({
  card,
  isPlayable = false,
  isFaceDown = false,
  onClick,
  size = 'md',
  style,
  className = '',
  animDelay = 0,
}: CardProps) {
  // Skip hover tracking on touch devices (no mouseenter on tap)
  const isTouchDevice = typeof globalThis.window !== 'undefined' && 'ontouchstart' in globalThis;
  const [isHovered, setIsHovered] = useState(false);
  const handleMouseEnter = useCallback(() => { if (!isTouchDevice) setIsHovered(true); }, [isTouchDevice]);
  const handleMouseLeave = useCallback(() => { if (!isTouchDevice) setIsHovered(false); }, [isTouchDevice]);
  const { w, h } = SIZES[size];
  const effect = getCardEffect(card);
  const effectLabel = EFFECT_LABELS[effect];
  const isSpecial = effect !== 'none';

  return (
    <div
      className={`relative cursor-pointer select-none card-3d ${isPlayable ? 'card-playable' : ''} ${className}`}
      style={{
        width: w,
        height: h,
        transformStyle: 'preserve-3d',
        transform: isHovered && !isFaceDown
          ? 'translateY(-15px) rotateX(5deg) scale(1.08)'
          : 'translateY(0) rotateX(0) scale(1)',
        transition: 'transform 0.25s cubic-bezier(0.34, 1.56, 0.64, 1), box-shadow 0.25s ease',
        animationDelay: `${animDelay}ms`,
        ...style,
      }}
      onClick={onClick}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      {isFaceDown ? (
        /* Card Back */
        <div
          className="absolute inset-0 rounded-lg overflow-hidden"
          style={{
            boxShadow: '0 4px 8px rgba(0,0,0,0.3)',
          }}
        >
          <img
            src="/cards/back.webp"
            alt="Card back"
            className="w-full h-full object-cover rounded-lg"
            draggable={false}
          />
        </div>
      ) : (
        /* Card Face */
        <div
          className="absolute inset-0 rounded-lg overflow-hidden"
          style={{
            borderColor: isPlayable ? '#FFD700' : 'transparent',
            borderWidth: isPlayable ? 2 : 0,
            borderStyle: 'solid',
            boxShadow: isPlayable
              ? '0 0 12px rgba(255, 215, 0, 0.5), 0 4px 12px rgba(0,0,0,0.2)'
              : '0 4px 8px rgba(0,0,0,0.2)',
          }}
        >
          <img
            src={getCardImagePath(card)}
            alt={`${card.value} of ${card.suit}`}
            className="w-full h-full object-cover rounded-lg"
            draggable={false}
          />

          {/* Effect badge */}
          {isSpecial && (
            <div
              className="absolute top-1 right-1 px-1 rounded text-white font-bold"
              style={{
                fontSize: size === 'sm' ? 7 : size === 'md' ? 9 : 11,
                background: effect === 'draw_two' || effect === 'draw_five'
                  ? '#e74c3c'
                  : effect === 'skip'
                  ? '#e67e22'
                  : '#9b59b6',
                boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
              }}
            >
              {effectLabel}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
