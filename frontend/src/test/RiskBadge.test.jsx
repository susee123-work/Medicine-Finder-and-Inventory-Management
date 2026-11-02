import { describe, it, expect } from 'vitest';
import React from 'react';
import { renderToString } from 'react-dom/server';
import RiskBadge from '../components/RiskBadge';

describe('RiskBadge component', () => {
  it('renders critical badge correctly', () => {
    const html = renderToString(<RiskBadge level="CRITICAL" score={85} />);
    expect(html).toContain('badge-critical');
    expect(html).toContain('Critical Risk');
    expect(html).toContain('(85)');
  });

  it('renders high badge correctly', () => {
    const html = renderToString(<RiskBadge level="HIGH" score={60} />);
    expect(html).toContain('badge-high');
    expect(html).toContain('High Risk');
    expect(html).toContain('(60)');
  });

  it('renders low badge for low risk', () => {
    const html = renderToString(<RiskBadge level="LOW" score={15} />);
    expect(html).toContain('badge-low');
    expect(html).toContain('Low Risk');
  });
});

