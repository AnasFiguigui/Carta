import React from 'react';
import { Suit } from 'shared';
import { SUIT_ICONS, SUIT_COLORS, SUIT_LABELS } from '../lib/cardUtils';
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
      <div className="bg-gray-900/95 border border-[#6E13E7]/50 rounded-2xl p-8 shadow-2xl animate-bounce-in">
        <h2 className="text-xl font-bold text-center text-white mb-6 font-heading">
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
              <img src={SUIT_ICONS[suit]} alt={SUIT_LABELS[suit].en} className="w-10 h-10 object-contain" />
              <span className="text-sm font-bold">{SUIT_LABELS[suit].en}</span>
              <span className="text-xs opacity-70" dir="rtl">{SUIT_LABELS[suit].ar}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
