import React from 'react';

export default function KPICard({ title, value, subtext, icon: Icon, trend, trendColor }) {
  return (
    <div className="card" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
        <div>
          <span style={{ fontSize: 13, color: 'var(--text-secondary)', fontWeight: 500 }}>{title}</span>
          <div style={{ fontSize: 26, fontWeight: 700, marginTop: 4, color: 'var(--text-primary)' }}>
            {value}
          </div>
        </div>
        {Icon && (
          <div style={{
            background: 'var(--primary-light)',
            color: 'var(--primary)',
            padding: 10,
            borderRadius: 'var(--radius-md)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}>
            <Icon size={20} />
          </div>
        )}
      </div>
      {(subtext || trend) && (
        <div style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 6, color: 'var(--text-muted)' }}>
          {trend && (
            <span style={{ fontWeight: 600, color: trendColor || 'var(--primary)' }}>
              {trend}
            </span>
          )}
          {subtext && <span>{subtext}</span>}
        </div>
      )}
    </div>
  );
}

