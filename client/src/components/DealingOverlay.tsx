import React, { useEffect, useState, useMemo } from 'react';

interface PlayerTarget {
  x: number; // percentage
  y: number; // percentage
  name: string;
}

interface DealingOverlayProps {
  players: PlayerTarget[];
  onComplete: () => void;
  cardsPerPlayer?: number;
}

/** Animated card dealing overlay - cards fly from center to each player */
export default function DealingOverlay({ players, onComplete, cardsPerPlayer = 4 }: Readonly<DealingOverlayProps>) {
  const [dealtCards, setDealtCards] = useState<{ id: number; playerIdx: number; cardNum: number }[]>([]);

  // Build the dealing sequence: round-robin, one card at a time to each player
  const sequence = useMemo(() => {
    const seq: { playerIdx: number; cardNum: number }[] = [];
    for (let c = 0; c < cardsPerPlayer; c++) {
      for (let p = 0; p < players.length; p++) {
        seq.push({ playerIdx: p, cardNum: c });
      }
    }
    return seq;
  }, [players.length, cardsPerPlayer]);

  useEffect(() => {
    const totalCards = sequence.length;
    // Spread dealing over ~2.4s, then 0.6s pause before complete
    const interval = Math.min(120, 2400 / totalCards);
    let idx = 0;

    const timer = setInterval(() => {
      if (idx >= totalCards) {
        clearInterval(timer);
        setTimeout(onComplete, 600);
        return;
      }
      setDealtCards(prev => [...prev, { id: idx, ...sequence[idx] }]);
      idx++;
    }, interval);

    return () => clearInterval(timer);
  }, [sequence, onComplete]);

  return (
    <div className="fixed inset-0 z-50 pointer-events-none">
      {/* Center deck indicator */}
      <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
        <div className="w-[60px] h-[90px] rounded-lg overflow-hidden shadow-lg opacity-80">
          <img src="/cards/back.webp" alt="Deck" className="w-full h-full object-cover" draggable={false} />
        </div>
      </div>

      {/* Flying cards */}
      {dealtCards.map(({ id, playerIdx }) => {
        const target = players[playerIdx];
        if (!target) return null;
        return (
          <div
            key={id}
            className="absolute w-[50px] h-[75px] rounded-md overflow-hidden shadow-lg"
            style={{
              left: '50%',
              top: '50%',
              animation: `deal-to-player 0.4s ease-out forwards`,
              // CSS custom properties for the target position
              '--deal-x': `${target.x}vw`,
              '--deal-y': `${target.y}vh`,
            } as React.CSSProperties}
          >
            <img src="/cards/back.webp" alt="" className="w-full h-full object-cover" draggable={false} />
          </div>
        );
      })}
    </div>
  );
}
