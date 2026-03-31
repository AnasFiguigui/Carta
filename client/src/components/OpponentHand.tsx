import React from 'react';
import type { PublicPlayer, GamePhase } from 'shared';
import { useGameStore } from '../lib/store';
import Avatar from './Avatar';
import TurnTimer from './TurnTimer';

interface OpponentProps {
  player: PublicPlayer;
  position: { x: number; y: number; rotation: number };
  isCurrentTurn: boolean;
  turnStartedAt: number;
  turnTimeoutMs: number;
  gamePhase: GamePhase;
  pendingDrawAmount: number;
  currentPlayerId: string | undefined;
}

export default function OpponentHand({
  player,
  position,
  isCurrentTurn,
  turnStartedAt,
  turnTimeoutMs,
  gamePhase,
  pendingDrawAmount,
  currentPlayerId,
}: OpponentProps) {
  const activeEffect = useGameStore((s) => s.activeEffect);
  const isTarget = activeEffect?.targetId === player.id;

  // Fan the card backs
  const cardCount = player.cardCount;
  const fanAngle = Math.min(cardCount * 6, 40);
  const startAngle = -fanAngle / 2;

  return (
    <div
      className="absolute flex flex-col items-center"
      style={{
        left: `${position.x}%`,
        top: `${position.y}%`,
        transform: `translate(-50%, -50%) rotate(${position.rotation}deg)`,
        zIndex: 10,
      }}
    >
      {/* Avatar + Timer row */}
      <div className="flex items-center gap-2 mb-1">
        <Avatar
          name={player.name}
          avatarId={player.avatarId}
          avatarColor={player.avatarColor}
          size="sm"
          isCurrentTurn={isCurrentTurn}
          isDisconnected={!player.isConnected}
        />
        {/* Show timer next to avatar when it's their turn */}
        {isCurrentTurn && (gamePhase === 'playing' || gamePhase === 'choosing_wild_suit') && turnStartedAt > 0 && (
          <TurnTimer
            turnStartedAt={turnStartedAt}
            turnTimeoutMs={turnTimeoutMs}
            size={28}
          />
        )}
      </div>

      {/* Card fan */}
      <div className="relative" style={{ width: 100, height: 70 }}>
        {Array.from({ length: cardCount }).map((_, i) => {
          const angle = cardCount > 1
            ? startAngle + (i / (cardCount - 1)) * fanAngle
            : 0;
          return (
            <div
              key={i}
              className="absolute left-1/2 bottom-0 opponent-card"
              style={{
                width: 45,
                height: 67,
                marginLeft: -22.5,
                transform: `rotate(${angle}deg)`,
                transformOrigin: 'bottom center',
                zIndex: i,
              }}
            >
              <img
                src="/cards/back.webp"
                alt="Card back"
                className="w-full h-full object-cover rounded"
                draggable={false}
                style={{
                  boxShadow: '0 2px 4px rgba(0,0,0,0.3)',
                }}
              />
            </div>
          );
        })}
      </div>

      {/* Player name and card count */}
      <div
        className={`mt-1 px-3 py-1 rounded-full text-xs font-bold text-center whitespace-nowrap
          ${isCurrentTurn ? 'turn-indicator' : ''}
          ${!player.isConnected ? 'opacity-50' : ''}`}
        style={{
          background: isCurrentTurn
            ? 'rgba(255, 215, 0, 0.3)'
            : 'rgba(0, 0, 0, 0.5)',
          border: isCurrentTurn ? '2px solid #FFD700' : '1px solid rgba(255,255,255,0.2)',
          transform: `rotate(${-position.rotation}deg)`,
        }}
      >
        <span>{player.name}</span>
        <span className="ml-1.5 opacity-70">({cardCount})</span>
        {!player.isConnected && <span className="ml-1">📡</span>}
      </div>

      {/* Pending draw indicator for target player */}
      {pendingDrawAmount > 0 && currentPlayerId === player.id && (
        <div className="absolute -top-3 left-1/2 -translate-x-1/2 animate-bounce-in z-20">
          <div className="px-2 py-0.5 bg-red-600 rounded-full text-white text-xs font-bold shadow-lg">
            +{pendingDrawAmount}
          </div>
        </div>
      )}

      {/* Effect indicator */}
      {isTarget && activeEffect && (
        <div className="absolute -top-6 left-1/2 -translate-x-1/2 animate-bounce-in">
          <div className="px-2 py-1 bg-red-600 rounded text-white text-xs font-bold whitespace-nowrap shadow-lg">
            {activeEffect.effect === 'draw_two' && `+${activeEffect.amount || 2}`}
            {activeEffect.effect === 'draw_five' && `+${activeEffect.amount || 5}`}
            {activeEffect.effect === 'skip' && '⛔ SKIP'}
          </div>
        </div>
      )}
    </div>
  );
}
