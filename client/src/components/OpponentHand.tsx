import React, { useMemo } from 'react';
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
  isDealing?: boolean;
  isMobile?: boolean;
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
  isDealing = false,
  isMobile = false,
}: Readonly<OpponentProps>) {
  const activeEffect = useGameStore((s) => s.activeEffect);
  const isTarget = activeEffect?.targetId === player.id;

  // Fan the card backs in an arc (facing the deck/center)
  const cardCount = player.cardCount;
  const fanAngle = Math.min(cardCount * (isMobile ? 14 : 18), isMobile ? 90 : 120);
  const startAngle = -fanAngle / 2;

  // Mobile: smaller container and cards
  const containerSize = isMobile ? 80 : 140;
  const cardW = isMobile ? 26 : 40;
  const cardH = isMobile ? 39 : 60;
  const arcRadius = isMobile ? 28 : 44;
  const arcCx = containerSize / 2;
  const arcCy = isMobile ? 40 : 62;
  const avatarSize = isMobile ? 'md' as const : 'lg' as const;
  const avatarTop = isMobile ? 4 : 8;

  // Memoize card position calculations (trig) — only recompute on card count or sizing changes
  const cardPositions = useMemo(() => {
    return Array.from({ length: cardCount }, (_, i) => {
      const angle = cardCount > 1
        ? startAngle + (i / (cardCount - 1)) * fanAngle
        : 0;
      const radians = (angle + 90) * (Math.PI / 180);
      const x = arcCx + Math.cos(radians) * arcRadius - cardW / 2;
      const y = arcCy + Math.sin(radians) * arcRadius - cardH / 2;
      return { x, y, angle };
    });
  }, [cardCount, startAngle, fanAngle, arcCx, arcCy, arcRadius, cardW, cardH]);

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
      <div className="relative" style={{ width: containerSize, height: containerSize }}>
        {/* Crown for finished players */}
        {isFinished && !isKicked && (
          <div className={`absolute left-1/2 -translate-x-1/2 -top-1 z-20 ${isMobile ? 'text-lg' : 'text-2xl'}`} style={{ filter: 'drop-shadow(0 0 6px rgba(255,215,0,0.8))' }}>👑</div>
        )}

        {/* Avatar (upper portion) — counter-rotate if container is flipped */}
        <div className="absolute left-1/2 -translate-x-1/2 z-10" style={{ top: avatarTop, transform: `translateX(-50%) rotate(${-position.rotation}deg)` }}>
          <Avatar
            name={player.name}
            avatarId={player.avatarId}
            avatarColor={player.avatarColor}
            size={avatarSize}
            isCurrentTurn={isCurrentTurn && !isFinished}
            isDisconnected={!player.isConnected}
            turnStartedAt={showTimer ? turnStartedAt : undefined}
            turnTimeoutMs={showTimer ? turnTimeoutMs : undefined}
          />
        </div>

        {/* Cards fanned in an arc below the avatar — only if not finished and not dealing */}
        {!isFinished && !isDealing && cardPositions.map((pos, i) => (
            <div
              key={`${player.id}-card-back-${i}`}
              className="absolute opponent-card opponent-card-shadow"
              style={{
                width: cardW,
                height: cardH,
                left: pos.x,
                top: pos.y,
                transform: `rotate(${pos.angle}deg)`,
                transformOrigin: 'center top',
                zIndex: i,
              }}
            >
              <img
                src="/cards/back.webp"
                alt="Card back"
                className="w-full h-full object-cover rounded"
                draggable={false}
              />
            </div>
          ))}
      </div>

      {/* Player name and card count */}
      <div
        className={`px-2 py-0.5 rounded-full font-bold text-center whitespace-nowrap
          ${isMobile ? 'text-[10px] mt-2' : 'text-xs mt-1'}
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
