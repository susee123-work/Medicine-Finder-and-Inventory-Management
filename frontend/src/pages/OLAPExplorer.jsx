import React, { useState, useEffect, useCallback } from 'react';
import {
  Layers,
  History,
  CheckCircle,
  FileText,
  FileSpreadsheet,
  Grid,
  GitBranch,
  Play
} from 'lucide-react';
import { api } from '../api/client';
import LoadingSkeleton from '../components/LoadingSkeleton';
import EmptyState from '../components/EmptyState';
import SchemaVisualizer from '../components/SchemaVisualizer';
import SnowflakeHierarchyTree from '../components/SnowflakeHierarchyTree';
import OLAPPivotHeatmap from '../components/OLAPPivotHeatmap';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import 'jspdf-autotable';

export default function OLAPExplorer() {
  const [schemaType, setSchemaType] = useState('star'); // 'star' or 'snowflake'
  const [selectedDims, setSelectedDims] = useState(['month_name', 'pharmacy_name']);
  const [selectedMeasures, setSelectedMeasures] = useState(['units_sold', 'revenue']);
  const [periodComparison, setPeriodComparison] = useState(true);
  const [topN, setTopN] = useState(10);
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState(null);
  const [etlRuns, setEtlRuns] = useState([]);
  const [activeTab, setActiveTab] = useState('explorer'); // 'explorer', 'pivot_heatmap', 'snowflake_tree', 'schema_visualizer', 'etl_history'
  const [etlRunning, setEtlRunning] = useState(false);
  const [etlResult, setEtlResult] = useState(null);

  const availableDims = [
    { id: 'year', label: 'Year (Time)' },
    { id: 'quarter_name', label: 'Quarter (Time)' },
    { id: 'month_name', label: 'Month (Time)' },
    { id: 'day_name', label: 'Day of Week (Time)' },
    { id: 'pharmacy_name', label: 'Pharmacy (Geo)' },
    { id: 'city', label: 'City (Geo)' },
    { id: 'district', label: 'District (Geo)' },
    { id: 'state', label: 'State (Geo)' },
    { id: 'therapeutic_category', label: 'Therapeutic Class (ATC)' },
    { id: 'atc_level1', label: 'ATC Level 1 Main Group' },
    { id: 'supplier_name', label: 'Supplier / Distributor' }
  ];

  const availableMeasures = [
    { id: 'units_sold', label: 'Units Sold' },
    { id: 'revenue', label: 'Net Revenue (₹)' },
    { id: 'transaction_count', label: 'Transaction Count' },
    { id: 'avg_price', label: 'Average Unit Price (₹)' },
    { id: 'avg_delay_days', label: 'Average Delivery Delay (Days)' },
    { id: 'fill_rate_pct', label: 'Fulfillment Rate (%)' }
  ];

  const runQuery = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.olap.query({
        schema_type: schemaType,
        dimensions: selectedDims,
        measures: selectedMeasures,
        period_comparison: periodComparison,
        top_n: topN > 0 ? topN : null
      });
      setData(res);
    } catch (err) {
      console.error('OLAP Query failed:', err);
    } finally {
      setLoading(false);
    }
  }, [schemaType, selectedDims, selectedMeasures, periodComparison, topN]);

  const loadMetadata = async () => {
    try {
      const runs = await api.olap.etlHistory();
      setEtlRuns(runs);
    } catch (err) {
      console.warn('Could not load OLAP metadata:', err);
    }
  };

  useEffect(() => {
    runQuery();
    loadMetadata();
  }, [runQuery]);

  const handleToggleDim = (id) => {
    if (selectedDims.includes(id)) {
      if (selectedDims.length > 1) {
        setSelectedDims(selectedDims.filter((d) => d !== id));
      }
    } else {
      setSelectedDims([...selectedDims, id]);
    }
  };

  const handleToggleMeasure = (id) => {
    if (selectedMeasures.includes(id)) {
      if (selectedMeasures.length > 1) {
        setSelectedMeasures(selectedMeasures.filter((m) => m !== id));
      }
    } else {
      setSelectedMeasures([...selectedMeasures, id]);
    }
  };

  const handleTriggerEtl = async () => {
    setEtlRunning(true);
    try {
      const res = await api.olap.runEtl();
      setEtlResult(res);
      const runs = await api.olap.etlHistory();
      setEtlRuns(runs);
      runQuery();
    } catch (err) {
      alert('ETL Pipeline Failed: ' + err.message);
    } finally {
      setEtlRunning(false);
    }
  };

  // Export to Excel
  const handleExportExcel = () => {
    if (!data?.cells) return;
    const ws = XLSX.utils.json_to_sheet(data.cells);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'OLAP_CUBE');
    XLSX.writeFile(wb, `MediPulse_OLAP_Report_${schemaType.toUpperCase()}.xlsx`);
  };

  // Export to PDF
  const handleExportPDF = () => {
    if (!data?.cells || data.cells.length === 0) return;
    const doc = new jsPDF();
    doc.setFontSize(16);
    doc.text(`MediPulse AI — ${schemaType.toUpperCase()} Schema OLAP Intelligence Report`, 14, 18);
    doc.setFontSize(10);
    doc.text(`Generated: ${new Date().toLocaleString()} • Multidimensional Rollup`, 14, 25);

    const headers = [...selectedDims, ...selectedMeasures];
    if (periodComparison) headers.push('pop_pct_change');

    const tableRows = data.cells.map((c) => headers.map((h) => c[h] ?? ''));

    doc.autoTable({
      head: [headers.map((h) => h.replace('_', ' ').toUpperCase())],
      body: tableRows,
      startY: 32,
      theme: 'grid',
      headStyles: { fillColor: [15, 163, 163] },
      styles: { fontSize: 9 }
    });

    doc.save(`MediPulse_OLAP_Report_${schemaType.toUpperCase()}.pdf`);
  };

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h2 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>
            Multidimensional OLAP Cube & Snowflake Architecture Explorer
          </h2>
          <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 2 }}>
            Interactive slice, dice, roll-up, drill-down across Star and Snowflake schemas with 2D Heatmaps and Schema Architecture Visualizers.
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          {/* Schema Selector */}
          <div style={{ display: 'flex', background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', overflow: 'hidden' }}>
            <button
              onClick={() => setSchemaType('star')}
              style={{
                padding: '6px 14px',
                border: 'none',
                fontSize: 12,
                fontWeight: 600,
                cursor: 'pointer',
                background: schemaType === 'star' ? 'var(--primary)' : 'transparent',
                color: schemaType === 'star' ? '#ffffff' : 'var(--text-secondary)'
              }}
            >
              ⭐ Star Schema
            </button>
            <button
              onClick={() => setSchemaType('snowflake')}
              style={{
                padding: '6px 14px',
                border: 'none',
                fontSize: 12,
                fontWeight: 600,
                cursor: 'pointer',
                background: schemaType === 'snowflake' ? 'var(--primary)' : 'transparent',
                color: schemaType === 'snowflake' ? '#ffffff' : 'var(--text-secondary)'
              }}
            >
              ❄️ Snowflake Schema
            </button>
          </div>

          <button className="btn btn-secondary btn-sm" onClick={handleExportPDF}>
            <FileText size={14} /> Export PDF
          </button>
          <button className="btn btn-secondary btn-sm" onClick={handleExportExcel}>
            <FileSpreadsheet size={14} /> Export Excel
          </button>
          <button className="btn btn-primary btn-sm" disabled={etlRunning} onClick={handleTriggerEtl}>
            <Play size={14} /> {etlRunning ? 'Running ETL...' : 'Trigger Incremental ETL'}
          </button>
        </div>
      </div>

      {etlResult && (
        <div style={{ padding: '12px 16px', background: 'var(--low-bg)', color: 'var(--low)', borderRadius: 'var(--radius-sm)', marginBottom: 16, fontSize: 13 }}>
          <CheckCircle size={16} style={{ verticalAlign: 'middle', marginRight: 6 }} />
          Incremental ETL Finished! <b>{etlResult.rows_loaded} rows loaded</b> into warehouse in {etlResult.duration_seconds}s.
          Quality checks: <b>{etlResult.quality_checks_passed} passed</b>, {etlResult.quality_checks_failed} failed.
        </div>
      )}

      {/* Navigation Tabs */}
      <div style={{ display: 'flex', gap: 8, borderBottom: '1px solid var(--border)', marginBottom: 18, overflowX: 'auto' }}>
        <button
          onClick={() => setActiveTab('explorer')}
          style={{
            padding: '10px 16px',
            border: 'none',
            borderBottom: activeTab === 'explorer' ? '2px solid var(--primary)' : '2px solid transparent',
            background: 'transparent',
            color: activeTab === 'explorer' ? 'var(--primary)' : 'var(--text-secondary)',
            fontWeight: 600,
            fontSize: 13,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            whiteSpace: 'nowrap'
          }}
        >
          <Layers size={16} /> Cube Slice & Dice
        </button>

        <button
          onClick={() => setActiveTab('pivot_heatmap')}
          style={{
            padding: '10px 16px',
            border: 'none',
            borderBottom: activeTab === 'pivot_heatmap' ? '2px solid var(--primary)' : '2px solid transparent',
            background: 'transparent',
            color: activeTab === 'pivot_heatmap' ? 'var(--primary)' : 'var(--text-secondary)',
            fontWeight: 600,
            fontSize: 13,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            whiteSpace: 'nowrap'
          }}
        >
          <Grid size={16} /> 2D Pivot Heatmap Matrix
        </button>

        <button
          onClick={() => setActiveTab('snowflake_tree')}
          style={{
            padding: '10px 16px',
            border: 'none',
            borderBottom: activeTab === 'snowflake_tree' ? '2px solid var(--primary)' : '2px solid transparent',
            background: 'transparent',
            color: activeTab === 'snowflake_tree' ? 'var(--primary)' : 'var(--text-secondary)',
            fontWeight: 600,
            fontSize: 13,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            whiteSpace: 'nowrap'
          }}
        >
          <GitBranch size={16} /> ❄️ Snowflake Hierarchy Drill-Down
        </button>

        <button
          onClick={() => setActiveTab('schema_visualizer')}
          style={{
            padding: '10px 16px',
            border: 'none',
            borderBottom: activeTab === 'schema_visualizer' ? '2px solid var(--primary)' : '2px solid transparent',
            background: 'transparent',
            color: activeTab === 'schema_visualizer' ? 'var(--primary)' : 'var(--text-secondary)',
            fontWeight: 600,
            fontSize: 13,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            whiteSpace: 'nowrap'
          }}
        >
          <span>📐</span> Interactive Schema Visualizer (Star vs Snowflake)
        </button>

        <button
          onClick={() => setActiveTab('etl_history')}
          style={{
            padding: '10px 16px',
            border: 'none',
            borderBottom: activeTab === 'etl_history' ? '2px solid var(--primary)' : '2px solid transparent',
            background: 'transparent',
            color: activeTab === 'etl_history' ? 'var(--primary)' : 'var(--text-secondary)',
            fontWeight: 600,
            fontSize: 13,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            whiteSpace: 'nowrap'
          }}
        >
          <History size={16} /> ETL & SCD Audit Log ({etlRuns.length})
        </button>
      </div>

      {/* Tab 1: Slice & Dice Explorer */}
      {activeTab === 'explorer' && (
        <div>
          {/* Controls Panel */}
          <div className="card" style={{ marginBottom: 16 }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 20 }}>
              {/* Dimensions Selector */}
              <div style={{ flex: 1, minWidth: 280 }}>
                <span style={{ fontSize: 12, fontWeight: 600, textTransform: 'uppercase', color: 'var(--text-muted)' }}>
                  1. Select Dimensions (Hierarchies):
                </span>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
                  {availableDims.map((d) => (
                    <button
                      key={d.id}
                      onClick={() => handleToggleDim(d.id)}
                      className="btn btn-sm"
                      style={{
                        background: selectedDims.includes(d.id) ? 'var(--primary)' : 'var(--bg-surface-hover)',
                        color: selectedDims.includes(d.id) ? '#ffffff' : 'var(--text-secondary)',
                        border: '1px solid var(--border)'
                      }}
                    >
                      {d.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Measures Selector */}
              <div style={{ flex: 1, minWidth: 260 }}>
                <span style={{ fontSize: 12, fontWeight: 600, textTransform: 'uppercase', color: 'var(--text-muted)' }}>
                  2. Select Measures (Aggregations):
                </span>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
                  {availableMeasures.map((m) => (
                    <button
                      key={m.id}
                      onClick={() => handleToggleMeasure(m.id)}
                      className="btn btn-sm"
                      style={{
                        background: selectedMeasures.includes(m.id) ? 'var(--accent)' : 'var(--bg-surface-hover)',
                        color: selectedMeasures.includes(m.id) ? '#ffffff' : 'var(--text-secondary)',
                        border: '1px solid var(--border)'
                      }}
                    >
                      {m.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Filters & Options */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                <div>
                  <span style={{ fontSize: 12, fontWeight: 600, display: 'block', color: 'var(--text-muted)' }}>
                    Top-N Ranking:
                  </span>
                  <select className="select" value={topN} onChange={(e) => setTopN(parseInt(e.target.value, 10))} style={{ marginTop: 4 }}>
                    <option value={5}>Top 5</option>
                    <option value={10}>Top 10</option>
                    <option value={25}>Top 25</option>
                    <option value={0}>All Records</option>
                  </select>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 18 }}>
                  <input
                    type="checkbox"
                    id="popCheck"
                    checked={periodComparison}
                    onChange={(e) => setPeriodComparison(e.target.checked)}
                  />
                  <label htmlFor="popCheck" style={{ fontSize: 13, fontWeight: 500, cursor: 'pointer' }}>
                    Period-over-Period (PoP) Growth %
                  </label>
                </div>

                <button className="btn btn-primary btn-sm" onClick={runQuery} style={{ marginTop: 18 }}>
                  Execute Query
                </button>
              </div>
            </div>
          </div>

          {/* Results Table */}
          {loading ? (
            <LoadingSkeleton height={48} count={8} />
          ) : data?.cells?.length === 0 ? (
            <EmptyState title="No aggregated cells found for query combination" />
          ) : (
            <div className="card">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                  Cube Result: <b>{data?.cell_count || 0} cells</b> aggregated across <b>{schemaType.toUpperCase()}</b> schema.
                </span>
                {data?.totals && (
                  <div style={{ fontSize: 12, display: 'flex', gap: 14 }}>
                    {data.totals.units_sold != null && <span>Total Units: <b>{data.totals.units_sold}</b></span>}
                    {data.totals.revenue != null && <span>Total Revenue: <b>₹{data.totals.revenue.toLocaleString()}</b></span>}
                  </div>
                )}
              </div>

              <div className="table-responsive">
                <table>
                  <thead>
                    <tr>
                      {selectedDims.map((dim) => (
                        <th key={dim}>{dim.replace('_', ' ').toUpperCase()}</th>
                      ))}
                      {selectedMeasures.map((measure) => (
                        <th key={measure}>{measure.replace('_', ' ').toUpperCase()}</th>
                      ))}
                      {periodComparison && <th>PERIOD-OVER-PERIOD (Δ%)</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {data?.cells?.map((cell, idx) => (
                      <tr key={idx}>
                        {selectedDims.map((dim) => (
                          <td key={dim}><b>{cell[dim] || '—'}</b></td>
                        ))}
                        {selectedMeasures.map((measure) => (
                          <td key={measure}>
                            {measure === 'revenue' || measure === 'avg_price'
                              ? `₹${(cell[measure] || 0).toLocaleString()}`
                              : (cell[measure] ?? '—')}
                          </td>
                        ))}
                        {periodComparison && (
                          <td>
                            {cell.pop_pct_change != null ? (
                              <span className={`badge ${cell.pop_pct_change >= 0 ? 'badge-low' : 'badge-critical'}`}>
                                {cell.pop_pct_change >= 0 ? `+${cell.pop_pct_change}%` : `${cell.pop_pct_change}%`}
                              </span>
                            ) : (
                              '—'
                            )}
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Tab 2: 2D Pivot Heatmap Matrix */}
      {activeTab === 'pivot_heatmap' && <OLAPPivotHeatmap />}

      {/* Tab 3: Snowflake Hierarchy Drill-Down Tree */}
      {activeTab === 'snowflake_tree' && <SnowflakeHierarchyTree />}

      {/* Tab 4: Interactive Schema Architecture Visualizer */}
      {activeTab === 'schema_visualizer' && <SchemaVisualizer />}

      {/* Tab 5: ETL Runs History & Quality Checks */}
      {activeTab === 'etl_history' && (
        <div className="card">
          <div className="card-header">
            <span className="card-title">
              <History size={18} style={{ color: 'var(--primary)' }} />
              ETL Execution Log, Quality Assurance & Watermarks
            </span>
          </div>
          <div className="table-responsive">
            <table>
              <thead>
                <tr>
                  <th>Pipeline Run ID</th>
                  <th>Status</th>
                  <th>Rows Extracted</th>
                  <th>Rows Loaded</th>
                  <th>Quality Passed</th>
                  <th>Quality Rejected</th>
                  <th>Started At</th>
                </tr>
              </thead>
              <tbody>
                {etlRuns.length === 0 ? (
                  <tr>
                    <td colSpan={7} style={{ textAlign: 'center', padding: 24 }}>No ETL runs logged yet.</td>
                  </tr>
                ) : (
                  etlRuns.map((run) => (
                    <tr key={run.run_id}>
                      <td><code>{run.run_id.slice(0, 13)}...</code></td>
                      <td>
                        <span className={`badge ${run.status === 'SUCCESS' ? 'badge-low' : 'badge-critical'}`}>
                          {run.status}
                        </span>
                      </td>
                      <td>{run.rows_extracted}</td>
                      <td><b>{run.rows_loaded}</b></td>
                      <td style={{ color: 'var(--low)' }}>✓ {run.quality_checks_passed}</td>
                      <td style={{ color: run.rows_rejected > 0 ? 'var(--critical)' : 'inherit' }}>
                        {run.rows_rejected}
                      </td>
                      <td>{new Date(run.started_at).toLocaleString()}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
