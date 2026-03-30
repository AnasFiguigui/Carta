import React from 'react';
import { Suit } from 'shared';
import { SUIT_SYMBOLS, SUIT_COLORS, SUIT_LABELS } from '../lib/cardUtils';
import { getSocket } from '../lib/socket';

interface SuitSelectorProps {
  onClose?: () => void;
}

export default function SuitSelector({ onClose }: SuitSelectorProps) {
  const suits = Object.values(Suit);

  const handleSelect = (suit: Suit) => {
    getSocket().emit('choose-suit', { suit });
    onClose?.();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 animate-fade-in">
      <div className="bg-gray-900/95 border border-yellow-500/50 rounded-2xl p-8 shadow-2xl animate-bounce-in">
        <h2 className="text-xl font-bold text-center text-yellow-300 mb-6">
          Choose a Suit
        </h2>
        <div className="grid grid-cols-2 gap-4">
          {suits.map((suit) => (
            <button
              key={suit}
              className="suit-button flex flex-col items-center gap-2 p-4 rounded-xl border-2 
                         hover:bg-white/10 transition-colors"
              style={{
                borderColor: SUIT_COLORS[suit],
                color: SUIT_COLORS[suit],
              }}
              onClick={() => handleSelect(suit)}
            >
              <span className="text-4xl">{SUIT_SYMBOLS[suit]}</span>
              <span className="text-sm font-bold">{SUIT_LABELS[suit].en}</span>
              <span className="text-xs opacity-70" dir="rtl">{SUIT_LABELS[suit].ar}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
