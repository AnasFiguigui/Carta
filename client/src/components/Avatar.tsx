import { AvatarId } from 'shared';
import { useEffect, useRef, useState } from 'react';

interface AvatarProps {
  name: string;
  avatarId: AvatarId;
  avatarColor: string;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  isCurrentTurn?: boolean;
  isDisconnected?: boolean;
  showConnectionDot?: boolean;
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

// eslint-disable-next-line sonarjs/cognitive-complexity
export default function Avatar({
  name,
  avatarId,
  avatarColor,
  size = 'md',
  isCurrentTurn = false,
  isDisconnected = false,
  showConnectionDot = false,
  turnStartedAt,
  turnTimeoutMs,
  onTimerWarning,
}: Readonly<AvatarProps>) {
  const letter = name.charAt(0).toUpperCase();
  const sizeInfo = SIZES[size];
  const [progress, setProgress] = useState(1);
  const warningFired = useRef(false);
  const rafRef = useRef<number>(0);

  let dotSize = 12;
  if (size === 'sm') {
    dotSize = 8;
  } else if (size === 'md') {
    dotSize = 10;
  }

  const showTimer = isCurrentTurn && !!turnStartedAt && turnStartedAt > 0 && !!turnTimeoutMs && turnTimeoutMs > 0;

  useEffect(() => {
    if (!showTimer) {
      setProgress(1);
      return;
    }
    warningFired.current = false;

    const tick = () => {
      const startedAt = turnStartedAt ?? 0;
      const timeout = turnTimeoutMs ?? 1;
      const elapsed = Date.now() - startedAt;
      const remaining = Math.max(0, timeout - elapsed);
      const pct = remaining / timeout;
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
  let ringColor = '#ef4444';
  if (progress > 0.5) {
    ringColor = '#22c55e';
  } else if (progress > 0.25) {
    ringColor = '#eab308';
  } else if (progress > 0.1) {
    ringColor = '#f97316';
  }

  const isUrgent = showTimer && progress < 10 / 30;
  let ringElement: JSX.Element | null = null;
  if (showTimer) {
    ringElement = (
      <svg
        width={ringSize}
        height={ringSize}
        className="absolute inset-0 rotate-[-90deg]"
      >
        <circle
          cx={ringSize / 2}
          cy={ringSize / 2}
          r={ringRadius}
          fill="transparent"
          stroke="rgba(255,255,255,0.08)"
          strokeWidth={3.5}
        />
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
    );
  } else if (isCurrentTurn) {
    ringElement = (
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
    );
  }

  return (
    <div
      className="relative inline-flex items-center justify-center select-none"
      style={{ width: ringSize, height: ringSize }}
      title={name}
    >
      {/* Timer ring or static turn ring */}
      {ringElement}

      {/* Avatar circle */}
      <div
        className={`
          rounded-full flex items-center justify-center font-bold text-white
          transition-all duration-300 relative
          ${sizeInfo.class}
          ${isUrgent ? 'avatar-urgent' : ''}
          ${isDisconnected ? 'opacity-40 grayscale' : ''}
        `}
        style={{ backgroundColor: avatarColor }}
      >
        <span>{letter}</span>
        {/* Messenger-style connection status dot */}
        {showConnectionDot && (
          <div
            className={`absolute rounded-full border-2 border-gray-900 ${
              isDisconnected ? 'bg-red-500 animate-pulse' : 'bg-green-500'
            }`}
            style={{
              width: dotSize,
              height: dotSize,
              bottom: -1,
              right: -1,
            }}
          />
        )}
      </div>
    </div>
  );
}
