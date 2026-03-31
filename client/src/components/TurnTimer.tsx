import { useEffect, useRef, useState } from 'react';

interface TurnTimerProps {
  turnStartedAt: number;
  turnTimeoutMs: number;
  isMyTurn?: boolean;
  size?: number; // diameter in px
  onWarning?: () => void;
}

export default function TurnTimer({
  turnStartedAt,
  turnTimeoutMs,
  isMyTurn = false,
  size = 48,
  onWarning,
}: TurnTimerProps) {
  const [progress, setProgress] = useState(1);
  const [secondsLeft, setSecondsLeft] = useState(Math.ceil(turnTimeoutMs / 1000));
  const warningFired = useRef(false);
  const rafRef = useRef<number>(0);

  useEffect(() => {
    warningFired.current = false;

    const tick = () => {
      const elapsed = Date.now() - turnStartedAt;
      const remaining = Math.max(0, turnTimeoutMs - elapsed);
      const pct = remaining / turnTimeoutMs;

      setProgress(pct);
      setSecondsLeft(Math.ceil(remaining / 1000));

      if (remaining <= 10000 && !warningFired.current && onWarning) {
        warningFired.current = true;
        onWarning();
      }

      if (remaining > 0) {
        rafRef.current = requestAnimationFrame(tick);
      }
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [turnStartedAt, turnTimeoutMs, onWarning]);

  const radius = (size - 6) / 2;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference * (1 - progress);

  // Color transitions: green → yellow → red
  const color =
    progress > 0.5 ? '#22c55e' :
    progress > 0.25 ? '#eab308' :
    '#ef4444';

  const isUrgent = secondsLeft <= 10;

  return (
    <div
      className={`relative inline-flex items-center justify-center ${isUrgent && isMyTurn ? 'animate-pulse' : ''}`}
      style={{ width: size, height: size }}
    >
      <svg
        width={size}
        height={size}
        className="rotate-[-90deg]"
      >
        {/* Background circle */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="transparent"
          stroke="rgba(255,255,255,0.1)"
          strokeWidth={3}
        />
        {/* Progress circle */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="transparent"
          stroke={color}
          strokeWidth={3}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={strokeDashoffset}
          className="transition-colors duration-300"
        />
      </svg>
      {/* Seconds text */}
      <span
        className="absolute text-xs font-bold"
        style={{ color }}
      >
        {secondsLeft}
      </span>
    </div>
  );
}
