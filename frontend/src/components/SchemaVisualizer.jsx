import React, { useState, useEffect } from 'react';
import { Database, Layers, ArrowRight, Eye } from 'lucide-react';
import { api } from '../api/client';
import LoadingSkeleton from './LoadingSkeleton';
import Modal from './Modal';

export default function SchemaVisualizer() {
  const [schemaType, setSchemaType] = useState('star'); // 'star' or 'snowflake'
  const [metadata, setMetadata] = useState(null);
  const [loading, setLoading] = useState(true);
  const [selectedTable, setSelectedTable] = useState(null);

  useEffect(() => {
    async function loadMeta() {
      setLoading(true);
      try {
        const res = await api.olap.schemaMetadata();
        setMetadata(res);
      } catch (err) {
        console.error('Failed to load schema metadata:', err);
      } finally {
        setLoading(false);
      }
    }
    loadMeta();
  }, []);

  if (loading || !metadata) {
    return <LoadingSkeleton height={300} count={2} />;
  }

  const currentSchema = metadata[schemaType];
  const tables = currentSchema?.tables || [];
  const factTables = tables.filter((t) => t.type === 'fact');
  const dimTables = tables.filter((t) => t.type === 'dimension');

  // Group snowflake dimensions by hierarchy
  const timeDims = dimTables.filter((t) => t.hierarchy === 'Time').sort((a, b) => (b.level || 0) - (a.level || 0));
  const geoDims = dimTables.filter((t) => t.hierarchy === 'Geography').sort((a, b) => (b.level || 0) - (a.level || 0));
  const atcDims = dimTables.filter((t) => t.hierarchy === 'ATC Classification').sort((a, b) => (b.level || 0) - (a.level || 0));
  const otherDims = dimTables.filter((t) => !t.hierarchy || t.hierarchy === 'Formulation');

  return (
    <div>
      {/* Top Controls & Explanation Banner */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Database size={20} style={{ color: 'var(--primary)' }} />
              <h3 style={{ fontSize: 18, fontWeight: 700, margin: 0 }}>
                {schemaType === 'star' ? '⭐ Star Schema Dimensional Model' : '❄️ Snowflake Schema (3NF Normalized) Model'}
              </h3>
            </div>
            <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 4, maxWidth: 800 }}>
              {currentSchema?.description}
            </p>
          </div>

          <div style={{ display: 'flex', background: 'var(--bg-surface-hover)', padding: 4, borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)' }}>
            <button
              onClick={() => setSchemaType('star')}
              style={{
                padding: '8px 16px',
                border: 'none',
                borderRadius: 'var(--radius-sm)',
                fontWeight: 600,
                fontSize: 13,
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
                padding: '8px 16px',
                border: 'none',
                borderRadius: 'var(--radius-sm)',
                fontWeight: 600,
                fontSize: 13,
                cursor: 'pointer',
                background: schemaType === 'snowflake' ? 'var(--primary)' : 'transparent',
                color: schemaType === 'snowflake' ? '#ffffff' : 'var(--text-secondary)'
              }}
            >
              ❄️ Snowflake Schema
            </button>
          </div>
        </div>

        {/* Comparison Callout */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 12, marginTop: 16, paddingTop: 14, borderTop: '1px solid var(--border)' }}>
          <div style={{ padding: '10px 14px', background: schemaType === 'star' ? 'var(--low-bg)' : 'var(--bg-surface-hover)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)' }}>
            <div style={{ fontWeight: 600, fontSize: 12, color: 'var(--primary)', marginBottom: 2 }}>⭐ STAR SCHEMA ADVANTAGES</div>
            <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
              • Denormalized single-hop joins minimize SQL complexity.<br />
              • Optimal for high-speed aggregations and business user reporting.<br />
              • Contains redundant attributes in dimension tables.
            </div>
          </div>
          <div style={{ padding: '10px 14px', background: schemaType === 'snowflake' ? 'var(--low-bg)' : 'var(--bg-surface-hover)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)' }}>
            <div style={{ fontWeight: 600, fontSize: 12, color: 'var(--primary)', marginBottom: 2 }}>❄️ SNOWFLAKE SCHEMA ADVANTAGES</div>
            <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
              • Third Normal Form (3NF) eliminates data redundancy completely.<br />
              • Granular normalization across Time, Geo, and ATC sub-tiers.<br />
              • Multiple join hops required to traverse parent-child hierarchies.
            </div>
          </div>
        </div>
      </div>

      {/* Visual Interactive Diagram */}
      <div className="card" style={{ padding: 24, marginBottom: 16, background: 'var(--bg-surface)', overflowX: 'auto' }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 16, textTransform: 'uppercase' }}>
          Interactive Diagram (Click any table to inspect grain, foreign keys, and live sample data):
        </div>

        {schemaType === 'star' ? (
          /* Star Schema Layout: Central Fact Table with Surrounding Dimensions */
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 24, minWidth: 700 }}>
            {/* Top Dimensions Row */}
            <div style={{ display: 'flex', justifyContent: 'center', gap: 20, flexWrap: 'wrap', width: '100%' }}>
              {dimTables.slice(0, 3).map((table) => (
                <TableCard key={table.id} table={table} onSelect={() => setSelectedTable(table)} />
              ))}
            </div>

            {/* Middle Section: Central Fact Table */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 20, width: '100%' }}>
              {factTables.map((table) => (
                <div
                  key={table.id}
                  onClick={() => setSelectedTable(table)}
                  style={{
                    padding: 16,
                    borderRadius: 'var(--radius-md)',
                    background: 'linear-gradient(135deg, rgba(15, 163, 163, 0.15), rgba(11, 42, 74, 0.25))',
                    border: '2px solid var(--primary)',
                    boxShadow: '0 4px 16px rgba(15, 163, 163, 0.2)',
                    cursor: 'pointer',
                    minWidth: 260,
                    textAlign: 'center',
                    transition: 'transform 0.2s'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, marginBottom: 4 }}>
                    <Layers size={18} style={{ color: 'var(--primary)' }} />
                    <span style={{ fontWeight: 700, fontSize: 15, color: 'var(--text-primary)' }}>{table.label}</span>
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--primary)', fontWeight: 600, marginBottom: 6 }}>
                    CENTRAL FACT TABLE
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Grain: {table.grain}</div>
                  <div style={{ marginTop: 8, fontSize: 11, background: 'var(--bg-surface)', padding: '4px 8px', borderRadius: 4, display: 'inline-block' }}>
                    <b>{table.row_count}</b> rows stored • Click to inspect
                  </div>
                </div>
              ))}
            </div>

            {/* Bottom Dimensions Row */}
            <div style={{ display: 'flex', justifyContent: 'center', gap: 20, flexWrap: 'wrap', width: '100%' }}>
              {dimTables.slice(3).map((table) => (
                <TableCard key={table.id} table={table} onSelect={() => setSelectedTable(table)} />
              ))}
            </div>
          </div>
        ) : (
          /* Snowflake Schema Layout: Multi-Tier Branching Hierarchies */
          <div style={{ display: 'flex', flexDirection: 'column', gap: 28, minWidth: 800 }}>
            {/* Central Snowflake Fact Table */}
            <div style={{ display: 'flex', justifyContent: 'center' }}>
              {factTables.map((table) => (
                <div
                  key={table.id}
                  onClick={() => setSelectedTable(table)}
                  style={{
                    padding: 16,
                    borderRadius: 'var(--radius-md)',
                    background: 'linear-gradient(135deg, rgba(15, 163, 163, 0.18), rgba(11, 42, 74, 0.3))',
                    border: '2px solid var(--primary)',
                    cursor: 'pointer',
                    minWidth: 320,
                    textAlign: 'center'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                    <Layers size={18} style={{ color: 'var(--primary)' }} />
                    <span style={{ fontWeight: 700, fontSize: 15 }}>{table.label}</span>
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--primary)', fontWeight: 600, marginTop: 2 }}>
                    3NF NORMALIZED SALES FACT (Grain: Day × Locality × Form × Medicine)
                  </div>
                  <div style={{ marginTop: 6, fontSize: 11, background: 'var(--bg-surface)', padding: '2px 8px', borderRadius: 4, display: 'inline-block' }}>
                    <b>{table.row_count}</b> rows • Click to inspect
                  </div>
                </div>
              ))}
            </div>

            {/* Hierarchical Snowflake Branches */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 20 }}>
              {/* Branch 1: Time Hierarchy */}
              <div style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', padding: 14, background: 'var(--bg-surface-hover)' }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: '#f59e0b', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span>📅</span> Time Normalization Hierarchy
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {timeDims.map((table, idx) => (
                    <div key={table.id} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <TableCard table={table} onSelect={() => setSelectedTable(table)} compact />
                      {idx < timeDims.length - 1 && <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>↓ 1:N</span>}
                    </div>
                  ))}
                </div>
              </div>

              {/* Branch 2: Geography Hierarchy */}
              <div style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', padding: 14, background: 'var(--bg-surface-hover)' }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: '#10b981', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span>🗺️</span> Geography Normalization Hierarchy
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {geoDims.map((table, idx) => (
                    <div key={table.id} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <TableCard table={table} onSelect={() => setSelectedTable(table)} compact />
                      {idx < geoDims.length - 1 && <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>↓ 1:N</span>}
                    </div>
                  ))}
                </div>
              </div>

              {/* Branch 3: ATC Classification Hierarchy */}
              <div style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', padding: 14, background: 'var(--bg-surface-hover)' }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: '#8b5cf6', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span>🩺</span> ATC Classification Hierarchy
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {atcDims.map((table, idx) => (
                    <div key={table.id} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <TableCard table={table} onSelect={() => setSelectedTable(table)} compact />
                      {idx < atcDims.length - 1 && <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>↓ 1:N</span>}
                    </div>
                  ))}
                </div>
              </div>

              {/* Branch 4: Formulation & Dosage Dimension */}
              {otherDims.length > 0 && (
                <div style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', padding: 14, background: 'var(--bg-surface-hover)' }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: '#ec4899', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span>💊</span> Formulation / Attributes
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {otherDims.map((table) => (
                      <div key={table.id} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <TableCard table={table} onSelect={() => setSelectedTable(table)} compact />
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Table Detail Modal */}
      {selectedTable && (
        <Modal
          isOpen={!!selectedTable}
          onClose={() => setSelectedTable(null)}
          title={`Table Specification: ${selectedTable.name}`}
          size="lg"
        >
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
              <div>
                <span className={`badge ${selectedTable.type === 'fact' ? 'badge-primary' : 'badge-low'}`} style={{ marginRight: 8 }}>
                  {selectedTable.type.toUpperCase()} TABLE
                </span>
                <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                  Stored Rows: <b>{selectedTable.row_count}</b>
                </span>
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                Primary Key: <code>{selectedTable.pk}</code>
              </div>
            </div>

            <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 16 }}>
              {selectedTable.description || `Grain: ${selectedTable.grain || '1 row per logical entity'}`}
            </p>

            {/* Foreign Keys */}
            {selectedTable.fks && selectedTable.fks.length > 0 && (
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 6 }}>
                  Foreign Key Join Relationships:
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {selectedTable.fks.map((fk, idx) => (
                    <div key={idx} style={{ padding: '4px 10px', background: 'var(--bg-surface-hover)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)', fontSize: 12 }}>
                      <code>{fk.col}</code> <ArrowRight size={12} style={{ verticalAlign: 'middle', margin: '0 4px' }} /> <b>{fk.ref}</b>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Measures or Attributes */}
            {selectedTable.measures && (
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 6 }}>
                  Quantitative Measures:
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {selectedTable.measures.map((m) => (
                    <span key={m} className="badge badge-accent">MEASURE: {m}</span>
                  ))}
                </div>
              </div>
            )}

            {selectedTable.attributes && (
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 6 }}>
                  Dimensional Attributes:
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {selectedTable.attributes.map((a) => (
                    <span key={a} className="badge" style={{ background: 'var(--bg-surface-hover)', border: '1px solid var(--border)' }}>
                      {a}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Sample Rows Preview */}
            <div style={{ marginTop: 20 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 8 }}>
                Live Database Sample Rows:
              </div>
              {selectedTable.sample_rows && selectedTable.sample_rows.length > 0 ? (
                <div className="table-responsive" style={{ maxHeight: 220 }}>
                  <table>
                    <thead>
                      <tr>
                        {Object.keys(selectedTable.sample_rows[0]).slice(0, 7).map((k) => (
                          <th key={k}>{k.toUpperCase()}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {selectedTable.sample_rows.map((row, rIdx) => (
                        <tr key={rIdx}>
                          {Object.values(row).slice(0, 7).map((val, cIdx) => (
                            <td key={cIdx} style={{ fontSize: 12 }}>
                              {typeof val === 'object' ? JSON.stringify(val) : String(val ?? '—')}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div style={{ padding: 12, textAlign: 'center', fontSize: 12, color: 'var(--text-muted)', background: 'var(--bg-surface-hover)', borderRadius: 'var(--radius-sm)' }}>
                  No records stored in this table yet. Run the initial ETL to populate all dimensions.
                </div>
              )}
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

function TableCard({ table, onSelect, compact = false }) {
  return (
    <div
      onClick={onSelect}
      style={{
        padding: compact ? '8px 12px' : '12px 14px',
        borderRadius: 'var(--radius-sm)',
        background: 'var(--bg-surface)',
        border: `1px solid ${table.color || 'var(--border)'}`,
        borderLeft: `4px solid ${table.color || 'var(--primary)'}`,
        cursor: 'pointer',
        minWidth: compact ? 200 : 220,
        boxShadow: 'var(--shadow-sm)',
        transition: 'all 0.15s ease'
      }}
      className="hover:shadow-md"
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontWeight: 600, fontSize: 13, color: 'var(--text-primary)' }}>{table.label}</span>
        <Eye size={14} style={{ color: 'var(--text-muted)' }} />
      </div>
      {!compact && (
        <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 4 }}>
          PK: <code>{table.pk}</code>
        </div>
      )}
      <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
        <b>{table.row_count}</b> rows
      </div>
    </div>
  );
}
