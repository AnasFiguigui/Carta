import React from 'react';
import type { PublicPlayer, GamePhase } from 'shared';
import { useGameStore } from '../lib/store';
import { getSocket } from '../lib/socket';
import Avatar from './Avatar';

interface OpponentProps {
  player: PublicPlayer;
  position: { x: number; y: number; rotation: number };
  isCurrentTurn: boolean;
  turnStartedAt: number;
  turnTimeoutMs: number;
  gamePhase: GamePhase;
  pendingDrawAmount: number;
  currentPlayerId: string | undefined;
  isFinished?: boolean;
  isKicked?: boolean;
  isHost?: boolean;
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
  isFinished = false,
  isKicked = false,
  isHost = false,
}: Readonly<OpponentProps>) {
  const activeEffect = useGameStore((s) => s.activeEffect);
  const isTarget = activeEffect?.targetId === player.id;

  // Fan the card backs in an arc BELOW the avatar (facing the deck/center)
  const cardCount = player.cardCount;
  const fanAngle = Math.min(cardCount * 18, 120);
  const startAngle = -fanAngle / 2;

  const showTimer = isCurrentTurn && !isFinished && (gamePhase === 'playing' || gamePhase === 'choosing_wild_suit') && turnStartedAt > 0;
  const isConnected = player.isConnected;

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
      {/* Container for avatar + cards below it */}
      <div className="relative" style={{ width: 140, height: 140 }}>
        {/* Crown for finished players */}
        {isFinished && !isKicked && (
          <div className="absolute left-1/2 -translate-x-1/2 -top-1 z-20 text-2xl" style={{ filter: 'drop-shadow(0 0 6px rgba(255,215,0,0.8))' }}>👑</div>
        )}

        {/* Avatar (upper portion) */}
        <div className="absolute left-1/2 -translate-x-1/2 z-10" style={{ top: 8 }}>
          <Avatar
            name={player.name}
            avatarId={player.avatarId}
            avatarColor={player.avatarColor}
            size="lg"
            isCurrentTurn={isCurrentTurn && !isFinished}
            isDisconnected={!player.isConnected}
            turnStartedAt={showTimer ? turnStartedAt : undefined}
            turnTimeoutMs={showTimer ? turnTimeoutMs : undefined}
          />
        </div>

        {/* Cards fanned in an arc below the avatar — only if not finished */}
        {!isFinished && Array.from({ length: cardCount }).map((_, i) => {
          const angle = cardCount > 1
            ? startAngle + (i / (cardCount - 1)) * fanAngle
            : 0;
          // +90 makes the arc point downward (toward deck/center)
          const radians = (angle + 90) * (Math.PI / 180);
          const radius = 44;
          const cx = 70; // center of container
          const cy = 62; // below avatar center
          const x = cx + Math.cos(radians) * radius - 20;
          const y = cy + Math.sin(radians) * radius - 30;
          return (
            <div
              key={`${player.id}-card-back-${i}`}
              className="absolute opponent-card"
              style={{
                width: 40,
                height: 60,
                left: x,
                top: y,
                transform: `rotate(${angle}deg)`,
                transformOrigin: 'center top',
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
        className={`-mt-1 px-3 py-1 rounded-full text-xs font-bold text-center whitespace-nowrap
          ${isCurrentTurn ? 'turn-indicator' : ''}
          ${isConnected ? '' : 'opacity-50'}`}
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
        {!isConnected && <span className="ml-1">📡</span>}
        {isHost && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              getSocket().emit('kick-player', { targetPlayerId: player.id });
            }}
            className="ml-1.5 text-red-400 hover:text-red-300 opacity-60 hover:opacity-100 transition-all active:scale-90"
            title={`Kick ${player.name}`}
          >
            ✕
          </button>
        )}
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
