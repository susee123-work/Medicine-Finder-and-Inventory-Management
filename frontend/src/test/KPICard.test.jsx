import { describe, it, expect } from 'vitest';
import React from 'react';
import { renderToString } from 'react-dom/server';
import KPICard from '../components/KPICard';

describe('KPICard component', () => {
  it('renders title, value and trend', () => {
    const html = renderToString(
      <KPICard
        title="Pharmacies Active"
        value={20}
        subtext="Tamil Nadu Region"
        trend="+100%"
      />
    );
    expect(html).toContain('Pharmacies Active');
    expect(html).toContain('20');
    expect(html).toContain('Tamil Nadu Region');
    expect(html).toContain('+100%');
  });
});

