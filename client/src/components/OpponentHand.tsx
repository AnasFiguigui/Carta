import React, { useMemo } from 'react';
import type { PublicPlayer, GamePhase } from 'shared';
import { useGameStore } from '../lib/store';
import { getSocket } from '../lib/socket';
import Avatar from './Avatar';

function getMobileSizing() {
  return { containerSize: 80, cardW: 26, cardH: 39, arcRadius: 28, arcCy: 40, avatarSize: 'md' as const, avatarTop: 4, fanMultiplier: 14, fanMax: 90, crownClass: 'text-lg', nameClass: 'text-[10px] mt-2' };
}
function getDesktopSizing() {
  return { containerSize: 140, cardW: 40, cardH: 60, arcRadius: 44, arcCy: 62, avatarSize: 'lg' as const, avatarTop: 8, fanMultiplier: 18, fanMax: 120, crownClass: 'text-2xl', nameClass: 'text-xs mt-1' };
}

const EFFECT_LABELS: Record<string, string> = {
  draw_two: '+',
  draw_five: '+',
  skip: '⛔ SKIP',
};

function EffectBadge({ effect, amount }: Readonly<{ effect: string; amount?: number }>) {
  const label = EFFECT_LABELS[effect];
  if (!label) return null;
  const text = effect === 'skip' ? label : `${label}${amount || 2}`;
  return (
    <div className="absolute -top-6 left-1/2 -translate-x-1/2 animate-bounce-in">
      <div className="px-2 py-1 bg-red-600 rounded text-white text-xs font-bold whitespace-nowrap shadow-lg">
        {text}
      </div>
    </div>
  );
}

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

  const cardCount = player.cardCount;
  const sz = isMobile ? getMobileSizing() : getDesktopSizing();
  const fanAngle = Math.min(cardCount * sz.fanMultiplier, sz.fanMax);
  const startAngle = -fanAngle / 2;
  const arcCx = sz.containerSize / 2;

  const cardPositions = useMemo(() => {
    return Array.from({ length: cardCount }, (_, i) => {
      const angle = cardCount > 1
        ? startAngle + (i / (cardCount - 1)) * fanAngle
        : 0;
      const radians = (angle + 90) * (Math.PI / 180);
      const x = arcCx + Math.cos(radians) * sz.arcRadius - sz.cardW / 2;
      const y = sz.arcCy + Math.sin(radians) * sz.arcRadius - sz.cardH / 2;
      return { x, y, angle };
    });
  }, [cardCount, startAngle, fanAngle, arcCx, sz.arcCy, sz.arcRadius, sz.cardW, sz.cardH]);

  const showTimer = isCurrentTurn && !isFinished && (gamePhase === 'playing' || gamePhase === 'choosing_wild_suit') && turnStartedAt > 0;
  const showCrown = isFinished && !isKicked;
  const showCards = !isFinished && !isDealing;
  const avatarIsTurn = isCurrentTurn && !isFinished;
  const showPendingDraw = pendingDrawAmount > 0 && currentPlayerId === player.id;
  const nameBg = isCurrentTurn ? 'rgba(255, 215, 0, 0.3)' : 'rgba(0, 0, 0, 0.5)';
  const nameBorder = isCurrentTurn ? '2px solid #FFD700' : '1px solid rgba(255,255,255,0.2)';
  const turnClass = isCurrentTurn ? 'turn-indicator' : '';
  const connClass = player.isConnected ? '' : 'opacity-50';

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
      <div className="relative" style={{ width: sz.containerSize, height: sz.containerSize }}>
        {showCrown && (
          <div className={`absolute left-1/2 -translate-x-1/2 -top-1 z-20 ${sz.crownClass}`} style={{ filter: 'drop-shadow(0 0 6px rgba(255,215,0,0.8))' }}>👑</div>
        )}

        <div className="absolute left-1/2 -translate-x-1/2 z-10" style={{ top: sz.avatarTop, transform: `translateX(-50%) rotate(${-position.rotation}deg)` }}>
          <Avatar
            name={player.name}
            avatarId={player.avatarId}
            avatarColor={player.avatarColor}
            size={sz.avatarSize}
            isCurrentTurn={avatarIsTurn}
            isDisconnected={!player.isConnected}
            turnStartedAt={showTimer ? turnStartedAt : undefined}
            turnTimeoutMs={showTimer ? turnTimeoutMs : undefined}
          />
        </div>

        {showCards && cardPositions.map((pos, i) => (
            <div
              key={`${player.id}-card-back-${i}`}
              className="absolute opponent-card opponent-card-shadow"
              style={{
                width: sz.cardW,
                height: sz.cardH,
                left: pos.x,
                top: pos.y,
                transform: `rotate(${pos.angle}deg)`,
                transformOrigin: 'center top',
                zIndex: i,
              }}
            >
              <img src="/cards/back.webp" alt="Card back" className="w-full h-full object-cover rounded" draggable={false} />
            </div>
          ))}
      </div>

      <div
        className={`px-2 py-0.5 rounded-full font-bold text-center whitespace-nowrap ${sz.nameClass} ${turnClass} ${connClass}`}
        style={{ background: nameBg, border: nameBorder, transform: `rotate(${-position.rotation}deg)` }}
      >
        <span>{player.name}</span>
        <span className="ml-1.5 opacity-70">({cardCount})</span>
        {!player.isConnected && <span className="ml-1">📡</span>}
        {isHost && (
          <button
            onClick={(e) => { e.stopPropagation(); getSocket().emit('kick-player', { targetPlayerId: player.id }); }}
            className="ml-1.5 text-red-400 hover:text-red-300 opacity-60 hover:opacity-100 transition-all active:scale-90"
            title={`Kick ${player.name}`}
          >
            ✕
          </button>
        )}
      </div>

      {showPendingDraw && (
        <div className="absolute -top-3 left-1/2 -translate-x-1/2 animate-bounce-in z-20">
          <div className="px-2 py-0.5 bg-red-600 rounded-full text-white text-xs font-bold shadow-lg">
            +{pendingDrawAmount}
          </div>
        </div>
      )}

      {isTarget && activeEffect && (
        <EffectBadge effect={activeEffect.effect} amount={activeEffect.amount} />
      )}
    </div>
  );
}
