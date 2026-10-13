import React, { useState, useEffect } from 'react';

export function CountdownText({ targetTimestamp, onZero, labelPrefix = '', className = '' }) {
  const [timeLeft, setTimeLeft] = useState(() => Math.max(0, Math.floor((targetTimestamp - Date.now()) / 1000)));

  useEffect(() => {
    const timer = setInterval(() => {
      const remaining = Math.max(0, Math.floor((targetTimestamp - Date.now()) / 1000));
      setTimeLeft(remaining);
      if (remaining === 0) {
        clearInterval(timer);
        onZero?.();
      }
    }, 1000);

    return () => clearInterval(timer);
  }, [targetTimestamp, onZero]);

  const minutes = Math.floor(timeLeft / 60);
  const seconds = timeLeft % 60;

  if (timeLeft === 0) {
    return <span className={`text-[var(--danger)] font-bold tnum ${className}`}>Time up</span>;
  }

  return (
    <span className={`tnum font-medium ${className}`}>
      {labelPrefix}
      {minutes > 0 ? `${minutes}m ` : ''}
      {seconds}s
    </span>
  );
}
