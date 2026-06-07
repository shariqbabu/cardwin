// src/components/games/GameTimer.tsx
import React, { useEffect, useState, useRef } from 'react';

interface GameTimerProps {
  endsAt: Date | any;
  onExpire?: () => void;
  className?: string;
}

const GameTimer: React.FC<GameTimerProps> = ({ endsAt, onExpire, className = '' }) => {
  const [secondsLeft, setSecondsLeft] = useState(30);
  const calledRef = useRef(false);

  useEffect(() => {
    calledRef.current = false;
    const interval = setInterval(() => {
      const target = endsAt instanceof Date ? endsAt :
        endsAt?.toDate ? endsAt.toDate() :
        new Date(endsAt);
      const diff = Math.max(0, Math.ceil((target.getTime() - Date.now()) / 1000));
      setSecondsLeft(diff);

      if (diff === 0 && !calledRef.current) {
        calledRef.current = true;
        onExpire?.();
        clearInterval(interval);
      }
    }, 250);

    return () => clearInterval(interval);
  }, [endsAt, onExpire]);

  const pct = Math.min(100, (secondsLeft / 30) * 100);
  const color = secondsLeft > 15
    ? 'text-emerald-400'
    : secondsLeft > 7
    ? 'text-amber-400'
    : 'text-red-400 animate-pulse';
  const barColor = secondsLeft > 15
    ? 'bg-emerald-500'
    : secondsLeft > 7
    ? 'bg-amber-500'
    : 'bg-red-500';

  return (
    <div className={`${className}`}>
      <div className={`text-3xl font-black tabular-nums ${color}`}>
        {secondsLeft}
        <span className="text-base font-normal ml-0.5">s</span>
      </div>
      <div className="w-full h-1.5 bg-gray-700 rounded-full mt-1 overflow-hidden">
        <div
          className={`h-full ${barColor} rounded-full transition-all duration-300`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
};

export default GameTimer;
