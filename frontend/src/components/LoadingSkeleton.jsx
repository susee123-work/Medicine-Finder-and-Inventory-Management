import React from 'react';

export default function LoadingSkeleton({ height = 40, count = 1, style = {} }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, ...style }}>
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className="skeleton"
          style={{ width: '100%', height: `${height}px` }}
        />
      ))}
    </div>
  );
}
