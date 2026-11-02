import React from 'react';

export default function RiskBadge({ level, score }) {
  const norm = (level || 'low').toLowerCase();
  let badgeClass = 'badge-low';
  let label = 'Low Risk';

  if (norm === 'critical') {
    badgeClass = 'badge-critical';
    label = 'Critical Risk';
  } else if (norm === 'high') {
    badgeClass = 'badge-high';
    label = 'High Risk';
  } else if (norm === 'medium') {
    badgeClass = 'badge-medium';
    label = 'Medium Risk';
  }

  return (
    <span className={`badge ${badgeClass}`} title={score != null ? `Risk Score: ${score}/100` : ''}>
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'currentColor' }}></span>
      {label} {score != null ? `(${Math.round(score)})` : ''}
    </span>
  );
}

