import React from 'react';

export function Skeleton({ className = '', height, width, circle = false }) {
  const style = {};
  if (height) style.height = height;
  if (width) style.width = width;

  return (
    <div
      style={style}
      className={`shimmer-box ${circle ? 'rounded-full' : 'rounded-2xl'} ${className}`}
      aria-hidden="true"
    />
  );
}
