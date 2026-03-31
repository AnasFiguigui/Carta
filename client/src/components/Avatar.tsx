import { AvatarId } from 'shared';
import { useEffect, useRef, useState } from 'react';

interface AvatarProps {
  name: string;
  avatarId: AvatarId;
  avatarColor: string;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  isCurrentTurn?: boolean;
  isDisconnected?: boolean;
  turnStartedAt?: number;
  turnTimeoutMs?: number;
  onTimerWarning?: () => void;
}

const SIZES: Record<string, { class: string; px: number }> = {
  sm: { class: 'w-8 h-8 text-xs', px: 32 },
  md: { class: 'w-10 h-10 text-sm', px: 40 },
  lg: { class: 'w-14 h-14 text-lg', px: 56 },
  xl: { class: 'w-20 h-20 text-2xl', px: 80 },
};

export default function Avatar({
  name,
  avatarId,
  avatarColor,
  size = 'md',
  isCurrentTurn = false,
  isDisconnected = false,
  turnStartedAt,
  turnTimeoutMs,
  onTimerWarning,
}: AvatarProps) {
  const letter = name.charAt(0).toUpperCase();
  const sizeInfo = SIZES[size];
  const [progress, setProgress] = useState(1);
  const warningFired = useRef(false);
  const rafRef = useRef<number>(0);

  const showTimer = isCurrentTurn && !!turnStartedAt && turnStartedAt > 0 && !!turnTimeoutMs && turnTimeoutMs > 0;

  useEffect(() => {
    if (!showTimer) {
      setProgress(1);
      return;
    }
    warningFired.current = false;

    const tick = () => {
      const elapsed = Date.now() - turnStartedAt!;
      const remaining = Math.max(0, turnTimeoutMs! - elapsed);
      const pct = remaining / turnTimeoutMs!;
      setProgress(pct);

      if (remaining <= 10000 && !warningFired.current && onTimerWarning) {
        warningFired.current = true;
        onTimerWarning();
      }

      if (remaining > 0) {
        rafRef.current = requestAnimationFrame(tick);
      }
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [showTimer, turnStartedAt, turnTimeoutMs, onTimerWarning]);

  // Timer ring dimensions
  const ringPadding = 5;
  const ringSize = sizeInfo.px + ringPadding * 2;
  const ringRadius = (ringSize - 4) / 2;
  const circumference = 2 * Math.PI * ringRadius;
  const strokeDashoffset = circumference * (1 - progress);

  // Color transitions: green → yellow → orange → red
  const ringColor =
    progress > 0.5 ? '#22c55e' :
    progress > 0.25 ? '#eab308' :
    progress > 0.1 ? '#f97316' :
    '#ef4444';

  const isUrgent = showTimer && progress < 10 / 30;

  return (
    <div
      className="relative inline-flex items-center justify-center select-none"
      style={{ width: ringSize, height: ringSize }}
      title={name}
    >
      {/* Timer ring or static turn ring */}
      {showTimer ? (
        <svg
          width={ringSize}
          height={ringSize}
          className="absolute inset-0 rotate-[-90deg]"
        >
          {/* Background track */}
          <circle
            cx={ringSize / 2}
            cy={ringSize / 2}
            r={ringRadius}
            fill="transparent"
            stroke="rgba(255,255,255,0.08)"
            strokeWidth={3.5}
          />
          {/* Animated progress ring */}
          <circle
            cx={ringSize / 2}
            cy={ringSize / 2}
            r={ringRadius}
            fill="transparent"
            stroke={ringColor}
            strokeWidth={3.5}
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={strokeDashoffset}
            style={{
              transition: 'stroke 0.3s ease',
              filter: `drop-shadow(0 0 ${isUrgent ? 8 : 4}px ${ringColor})`,
            }}
          />
        </svg>
      ) : isCurrentTurn ? (
        <svg
          width={ringSize}
          height={ringSize}
          className="absolute inset-0"
        >
          <circle
            cx={ringSize / 2}
            cy={ringSize / 2}
            r={ringRadius}
            fill="transparent"
            stroke="#facc15"
            strokeWidth={2.5}
            style={{ filter: 'drop-shadow(0 0 6px rgba(250,204,21,0.5))' }}
          />
        </svg>
      ) : null}

      {/* Avatar circle */}
      <div
        className={`
          rounded-full flex items-center justify-center font-bold text-white
          transition-all duration-300
          ${sizeInfo.class}
          ${isUrgent ? 'avatar-urgent' : ''}
          ${isDisconnected ? 'opacity-40 grayscale' : ''}
        `}
        style={{ backgroundColor: avatarColor }}
      >
        <span>{letter}</span>
      </div>
    </div>
  );
}
