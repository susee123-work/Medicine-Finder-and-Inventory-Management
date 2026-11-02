import React, { useState, useEffect } from 'react';
import { Grid, BarChart3, ArrowDownUp } from 'lucide-react';
import { api } from '../api/client';
import LoadingSkeleton from './LoadingSkeleton';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend
} from 'chart.js';
import { Bar } from 'react-chartjs-2';

ChartJS.register(CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend);

export default function OLAPPivotHeatmap() {
  const [rowDim, setRowDim] = useState('therapeutic_category');
  const [colDim, setColDim] = useState('quarter_name');
  const [measure, setMeasure] = useState('revenue');
  const [schemaType, setSchemaType] = useState('star');
  const [pivotData, setPivotData] = useState(null);
  const [loading, setLoading] = useState(true);

  const dimensionOptions = [
    { id: 'therapeutic_category', label: 'Therapeutic Category (ATC)' },
    { id: 'quarter_name', label: 'Quarter of Year (Time)' },
    { id: 'month_name', label: 'Month of Year (Time)' },
    { id: 'pharmacy_name', label: 'Pharmacy Dispensary (Geo)' },
    { id: 'city', label: 'City (Geo)' },
    { id: 'district', label: 'District (Geo)' },
    { id: 'state', label: 'State (Geo)' },
    { id: 'atc_level1', label: 'ATC Level 1 Group' }
  ];

  const measureOptions = [
    { id: 'revenue', label: 'Gross Revenue (₹)' },
    { id: 'units_sold', label: 'Units Sold (Qty)' }
  ];

  useEffect(() => {
    let isCurrent = true;
    const fetchPivot = async () => {
      setLoading(true);
      try {
        const res = await api.olap.pivotMatrix(rowDim, colDim, measure, schemaType);
        if (isCurrent) setPivotData(res);
      } catch (err) {
        console.error('Failed to load pivot matrix:', err);
      } finally {
        if (isCurrent) setLoading(false);
      }
    };
    fetchPivot();
    return () => {
      isCurrent = false;
    };
  }, [rowDim, colDim, measure, schemaType]);

  const handleSwapDims = () => {
    const temp = rowDim;
    setRowDim(colDim);
    setColDim(temp);
  };

  // Prepare Bar Chart Data
  const chartLabels = pivotData?.row_headers?.slice(0, 10) || [];
  const chartValues = chartLabels.map((r) => pivotData?.row_totals?.[r] || 0);

  const barChartData = {
    labels: chartLabels,
    datasets: [
      {
        label: measure === 'revenue' ? 'Revenue (₹)' : 'Units Sold',
        data: chartValues,
        backgroundColor: 'rgba(15, 163, 163, 0.85)',
        borderColor: '#0fa3a3',
        borderRadius: 4
      }
    ]
  };

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false }
    },
    scales: {
      y: {
        beginAtZero: true,
        ticks: {
          callback: (val) => (measure === 'revenue' ? `₹${val.toLocaleString()}` : val)
        }
      }
    }
  };

  return (
    <div>
      {/* Configuration Bar */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
          <div>
            <h3 style={{ fontSize: 18, fontWeight: 700, margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
              <Grid size={20} style={{ color: 'var(--primary)' }} />
              2D OLAP Cross-Tabulation & Heatmap Matrix
            </h3>
            <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 2 }}>
              Dynamically pivot two dimensional axes against any quantitative measure with color intensity heatmapping.
            </p>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            {/* Row Selector */}
            <div>
              <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', display: 'block' }}>ROW DIMENSION:</span>
              <select className="select" value={rowDim} onChange={(e) => setRowDim(e.target.value)}>
                {dimensionOptions.filter((d) => d.id !== colDim).map((d) => (
                  <option key={d.id} value={d.id}>{d.label}</option>
                ))}
              </select>
            </div>

            <button
              onClick={handleSwapDims}
              className="btn btn-secondary btn-sm"
              style={{ marginTop: 16 }}
              title="Swap Row & Column Dimensions"
            >
              <ArrowDownUp size={14} /> Swap
            </button>

            {/* Col Selector */}
            <div>
              <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', display: 'block' }}>COLUMN DIMENSION:</span>
              <select className="select" value={colDim} onChange={(e) => setColDim(e.target.value)}>
                {dimensionOptions.filter((d) => d.id !== rowDim).map((d) => (
                  <option key={d.id} value={d.id}>{d.label}</option>
                ))}
              </select>
            </div>

            {/* Measure Selector */}
            <div>
              <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', display: 'block' }}>MEASURE:</span>
              <select className="select" value={measure} onChange={(e) => setMeasure(e.target.value)}>
                {measureOptions.map((m) => (
                  <option key={m.id} value={m.id}>{m.label}</option>
                ))}
              </select>
            </div>

            {/* Schema Selector */}
            <div>
              <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', display: 'block' }}>SCHEMA:</span>
              <select className="select" value={schemaType} onChange={(e) => setSchemaType(e.target.value)}>
                <option value="star">⭐ Star Schema</option>
                <option value="snowflake">❄️ Snowflake Schema</option>
              </select>
            </div>
          </div>
        </div>
      </div>

      {loading || !pivotData ? (
        <LoadingSkeleton height={320} count={1} />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Heatmap Matrix Table */}
          <div className="card" style={{ padding: 16, overflowX: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)' }}>
                Grid: <b>{pivotData.row_headers.length} rows</b> × <b>{pivotData.col_headers.length} columns</b>
              </span>
              <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--primary)' }}>
                Grand Total: {measure === 'revenue' ? `₹${pivotData.grand_total.toLocaleString()}` : pivotData.grand_total.toLocaleString()}
              </span>
            </div>

            <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: 12 }}>
              <thead>
                <tr>
                  <th style={{ background: 'var(--bg-surface-hover)', padding: '10px 14px', border: '1px solid var(--border)', textAlign: 'left', minWidth: 160 }}>
                    {rowDim.replace('_', ' ').toUpperCase()} \ {colDim.replace('_', ' ').toUpperCase()}
                  </th>
                  {pivotData.col_headers.map((col) => (
                    <th key={col} style={{ background: 'var(--bg-surface-hover)', padding: '10px 14px', border: '1px solid var(--border)', textAlign: 'center', minWidth: 100 }}>
                      {col}
                    </th>
                  ))}
                  <th style={{ background: 'var(--primary)', color: '#ffffff', padding: '10px 14px', border: '1px solid var(--border)', textAlign: 'center', minWidth: 120 }}>
                    ROW TOTAL
                  </th>
                </tr>
              </thead>
              <tbody>
                {pivotData.row_headers.map((rowName, rIdx) => {
                  const rowTot = pivotData.row_totals[rowName] || 0;
                  return (
                    <tr key={rowName}>
                      <td style={{ fontWeight: 600, padding: '8px 12px', border: '1px solid var(--border)', background: 'var(--bg-surface)' }}>
                        {rowName}
                      </td>

                      {pivotData.col_headers.map((colName, cIdx) => {
                        const val = pivotData.matrix[rIdx]?.[cIdx] || 0;
                        const range = Math.max(1, pivotData.max_val - pivotData.min_val);
                        const norm = Math.max(0, Math.min(1, (val - pivotData.min_val) / range));
                        const bgIntensity = val > 0 ? 0.12 + norm * 0.75 : 0.03;
                        const textColor = norm > 0.5 ? '#ffffff' : 'var(--text-primary)';

                        return (
                          <td
                            key={colName}
                            style={{
                              textAlign: 'center',
                              padding: '8px 10px',
                              border: '1px solid var(--border)',
                              background: val > 0 ? `rgba(15, 163, 163, ${bgIntensity})` : 'transparent',
                              color: val > 0 && norm > 0.55 ? textColor : 'inherit',
                              fontWeight: norm > 0.4 ? 700 : 400
                            }}
                            title={`${rowName} × ${colName}: ${val}`}
                          >
                            {val > 0
                              ? measure === 'revenue'
                                ? `₹${Math.round(val).toLocaleString()}`
                                : val.toLocaleString()
                              : '—'}
                          </td>
                        );
                      })}

                      <td style={{ fontWeight: 700, textAlign: 'center', padding: '8px 12px', border: '1px solid var(--border)', background: 'var(--bg-surface-hover)' }}>
                        {measure === 'revenue' ? `₹${Math.round(rowTot).toLocaleString()}` : rowTot.toLocaleString()}
                      </td>
                    </tr>
                  );
                })}

                {/* Column Totals Row */}
                <tr style={{ background: 'var(--bg-surface-hover)', fontWeight: 700 }}>
                  <td style={{ padding: '10px 12px', border: '1px solid var(--border)', color: 'var(--primary)' }}>
                    COL TOTAL
                  </td>
                  {pivotData.col_headers.map((colName) => (
                    <td key={colName} style={{ textAlign: 'center', padding: '10px 12px', border: '1px solid var(--border)' }}>
                      {measure === 'revenue'
                        ? `₹${Math.round(pivotData.col_totals[colName] || 0).toLocaleString()}`
                        : (pivotData.col_totals[colName] || 0).toLocaleString()}
                    </td>
                  ))}
                  <td style={{ textAlign: 'center', padding: '10px 12px', border: '1px solid var(--border)', background: 'var(--primary)', color: '#ffffff' }}>
                    {measure === 'revenue' ? `₹${pivotData.grand_total.toLocaleString()}` : pivotData.grand_total.toLocaleString()}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* Top Categories Bar Chart */}
          <div className="card" style={{ padding: 18 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
              <BarChart3 size={18} style={{ color: 'var(--primary)' }} />
              <span style={{ fontWeight: 700, fontSize: 14 }}>
                {measure === 'revenue' ? 'Revenue Distribution' : 'Units Sold'} across {rowDim.replace('_', ' ').toUpperCase()}
              </span>
            </div>
            <div style={{ height: 260 }}>
              <Bar data={barChartData} options={chartOptions} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
