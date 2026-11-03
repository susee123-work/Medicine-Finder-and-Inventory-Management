import React, { useState, useEffect } from 'react';
import { ChevronRight, ChevronDown, Pill, MapPin, Calendar, Search, Layers } from 'lucide-react';
import { api } from '../api/client';
import LoadingSkeleton from './LoadingSkeleton';

export default function SnowflakeHierarchyTree() {
  const [hierarchies, setHierarchies] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeHierarchy, setActiveHierarchy] = useState('atc'); // 'atc', 'geo', 'time'
  const [expandedNodes, setExpandedNodes] = useState({});
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    async function loadData() {
      setLoading(true);
      try {
        const res = await api.olap.snowflakeHierarchies();
        setHierarchies(res);

        // Auto-expand first level nodes
        const initialExpanded = {};
        if (res?.atc_hierarchy) {
          res.atc_hierarchy.forEach((n) => { initialExpanded[n.id] = true; });
        }
        if (res?.geo_hierarchy) {
          res.geo_hierarchy.forEach((n) => { initialExpanded[n.id] = true; });
        }
        if (res?.time_hierarchy) {
          res.time_hierarchy.forEach((n) => { initialExpanded[n.id] = true; });
        }
        setExpandedNodes(initialExpanded);
      } catch (err) {
        console.error('Failed to load snowflake hierarchies:', err);
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, []);

  const toggleNode = (id) => {
    setExpandedNodes((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const expandAll = () => {
    const all = {};
    const traverse = (nodes) => {
      if (!nodes) return;
      nodes.forEach((n) => {
        all[n.id] = true;
        if (n.children) traverse(n.children);
      });
    };
    if (activeHierarchy === 'atc') traverse(hierarchies?.atc_hierarchy);
    if (activeHierarchy === 'geo') traverse(hierarchies?.geo_hierarchy);
    if (activeHierarchy === 'time') traverse(hierarchies?.time_hierarchy);
    setExpandedNodes(all);
  };

  const collapseAll = () => {
    setExpandedNodes({});
  };

  if (loading) {
    return <LoadingSkeleton height={60} count={6} />;
  }

  if (!hierarchies) {
    return (
      <div className="card" style={{ padding: 32, textAlign: 'center' }}>
        <p style={{ color: 'var(--text-secondary)', fontSize: 13, marginBottom: 12 }}>
          Could not load snowflake hierarchy trees.
        </p>
        <button onClick={() => window.location.reload()} className="btn btn-primary btn-sm">
          Refresh Page
        </button>
      </div>
    );
  }

  const currentTree =
    activeHierarchy === 'atc'
      ? hierarchies.atc_hierarchy
      : activeHierarchy === 'geo'
      ? hierarchies.geo_hierarchy
      : hierarchies.time_hierarchy;

  return (
    <div>
      {/* Hierarchy Selector & Controls */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
          <div>
            <h3 style={{ fontSize: 18, fontWeight: 700, margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
              <Layers size={20} style={{ color: 'var(--primary)' }} />
              Snowflake Schema Normalized Hierarchy Drill-Down
            </h3>
            <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 2 }}>
              Explore how dimensions in Third Normal Form (3NF) decompose into multi-tier trees, rolling up units sold and gross revenue.
            </p>
          </div>

          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button
              onClick={() => setActiveHierarchy('atc')}
              className={`btn btn-sm ${activeHierarchy === 'atc' ? 'btn-primary' : 'btn-secondary'}`}
            >
              <Pill size={14} /> ATC Classification (Level 1 → 2 → 3 → Drug)
            </button>
            <button
              onClick={() => setActiveHierarchy('geo')}
              className={`btn btn-sm ${activeHierarchy === 'geo' ? 'btn-primary' : 'btn-secondary'}`}
            >
              <MapPin size={14} /> Geography (State → District → Pharmacy)
            </button>
            <button
              onClick={() => setActiveHierarchy('time')}
              className={`btn btn-sm ${activeHierarchy === 'time' ? 'btn-primary' : 'btn-secondary'}`}
            >
              <Calendar size={14} /> Time (Year → Quarter → Month)
            </button>
          </div>
        </div>

        {/* Tree Search & Collapse Controls */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 14, paddingTop: 12, borderTop: '1px solid var(--border)', flexWrap: 'wrap', gap: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, maxWidth: 360 }}>
            <Search size={16} style={{ color: 'var(--text-muted)' }} />
            <input
              type="text"
              placeholder="Search in hierarchy (e.g., Paracetamol, Chennai, Q1)..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="input"
              style={{ padding: '6px 12px', fontSize: 13, width: '100%' }}
            />
          </div>

          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-secondary btn-sm" onClick={expandAll}>
              Expand All
            </button>
            <button className="btn btn-secondary btn-sm" onClick={collapseAll}>
              Collapse All
            </button>
          </div>
        </div>
      </div>

      {/* Tree Visualization Card */}
      <div className="card" style={{ padding: 18 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', paddingBottom: 8, borderBottom: '1px solid var(--border)', marginBottom: 12 }}>
          <span>Hierarchy Level & Entity Name</span>
          <div style={{ display: 'flex', gap: 40 }}>
            <span>Aggregated Units</span>
            <span style={{ width: 110, textAlign: 'right' }}>Rolled-up Revenue</span>
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {currentTree.map((rootNode) => (
            <TreeNode
              key={rootNode.id}
              node={rootNode}
              expandedNodes={expandedNodes}
              toggleNode={toggleNode}
              searchTerm={searchTerm}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function TreeNode({ node, expandedNodes, toggleNode, searchTerm, depth = 0 }) {
  const isExpanded = !!expandedNodes[node.id];
  const hasChildren = node.children && node.children.length > 0;

  // Filter check
  const matches = !searchTerm || node.name.toLowerCase().includes(searchTerm.toLowerCase());
  const childMatches = hasChildren && node.children.some((c) => c.name.toLowerCase().includes(searchTerm.toLowerCase()));

  if (!matches && !childMatches && searchTerm) {
    return null;
  }

  const levelColors = ['#0fa3a3', '#3b82f6', '#8b5cf6', '#ec4899'];
  const nodeColor = levelColors[depth % levelColors.length];

  return (
    <div>
      <div
        onClick={() => hasChildren && toggleNode(node.id)}
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '8px 12px',
          paddingLeft: depth * 24 + 12,
          borderRadius: 'var(--radius-sm)',
          background: isExpanded ? 'var(--bg-surface-hover)' : 'transparent',
          cursor: hasChildren ? 'pointer' : 'default',
          borderBottom: '1px solid var(--border-light, rgba(0,0,0,0.03))'
        }}
        className="hover:bg-surface-hover"
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {hasChildren ? (
            isExpanded ? <ChevronDown size={16} style={{ color: nodeColor }} /> : <ChevronRight size={16} style={{ color: 'var(--text-muted)' }} />
          ) : (
            <span style={{ width: 16, height: 16, display: 'inline-block' }} />
          )}

          <div
            style={{
              width: 8,
              height: 8,
              borderRadius: '50%',
              background: nodeColor,
              marginRight: 4
            }}
          />

          <span style={{ fontWeight: hasChildren ? 600 : 400, fontSize: 13, color: 'var(--text-primary)' }}>
            {node.name}
          </span>

          {node.generic && (
            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
              ({node.generic})
            </span>
          )}

          {node.form && (
            <span className="badge" style={{ fontSize: 10, padding: '2px 6px' }}>
              {node.form}
            </span>
          )}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 40 }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)' }}>
            {node.units_sold ? node.units_sold.toLocaleString() : '0'}
          </span>
          <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--primary)', width: 110, textAlign: 'right' }}>
            ₹{(node.revenue || 0).toLocaleString()}
          </span>
        </div>
      </div>

      {/* Render Sub-nodes */}
      {hasChildren && isExpanded && (
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {node.children.map((child) => (
            <TreeNode
              key={child.id}
              node={child}
              expandedNodes={expandedNodes}
              toggleNode={toggleNode}
              searchTerm={searchTerm}
              depth={depth + 1}
            />
          ))}
        </div>
      )}
    </div>
  );
}
