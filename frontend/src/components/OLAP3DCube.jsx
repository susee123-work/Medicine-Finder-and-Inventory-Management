import React, { useState, useEffect, useRef } from 'react';
import { Box, RotateCcw, Layers, RefreshCw, Play, Pause } from 'lucide-react';
import { api } from '../api/client';
import LoadingSkeleton from './LoadingSkeleton';

export default function OLAP3DCube() {
  const [cubeData, setCubeData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // 3D Orbit & Rotation angles
  const [rotX, setRotX] = useState(-24);
  const [rotY, setRotY] = useState(38);
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [autoRotate, setAutoRotate] = useState(false);

  // Slicing filters
  const [sliceTime, setSliceTime] = useState('ALL');
  const [sliceGeo, setSliceGeo] = useState('ALL');
  const [sliceCat, setSliceCat] = useState('ALL');

  // Cube spacing (Explode)
  const [spacing, setSpacing] = useState(65); // base distance between cell centers in px
  const [activeMeasure, setActiveMeasure] = useState('revenue'); // 'revenue' or 'units_sold'
  const [selectedVoxel, setSelectedVoxel] = useState(null);

  const containerRef = useRef(null);

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.olap.cube3d();
      setCubeData(res);
      if (res?.voxels && res.voxels.length > 0) {
        setSelectedVoxel(res.voxels[0]);
      }
    } catch (err) {
      console.error('Failed to load 3D OLAP Cube data:', err);
      setError('Could not load 3D Cube data. Please check backend connection.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  // Auto-rotation timer
  useEffect(() => {
    if (!autoRotate) return;
    const interval = setInterval(() => {
      setRotY((prev) => (prev + 1) % 360);
    }, 45);
    return () => clearInterval(interval);
  }, [autoRotate]);

  // Mouse drag orbiting
  const handleMouseDown = (e) => {
    setIsDragging(true);
    setDragStart({ x: e.clientX, y: e.clientY });
  };

  const handleMouseMove = (e) => {
    if (!isDragging) return;
    const deltaX = e.clientX - dragStart.x;
    const deltaY = e.clientY - dragStart.y;
    setRotY((prev) => prev + deltaX * 0.4);
    setRotX((prev) => Math.max(-80, Math.min(80, prev - deltaY * 0.4)));
    setDragStart({ x: e.clientX, y: e.clientY });
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  const resetView = () => {
    setRotX(-24);
    setRotY(38);
    setSpacing(65);
    setSliceTime('ALL');
    setSliceGeo('ALL');
    setSliceCat('ALL');
  };

  if (loading) {
    return <LoadingSkeleton height={380} count={1} />;
  }

  if (error || !cubeData) {
    return (
      <div className="card" style={{ padding: 32, textAlign: 'center' }}>
        <Box size={40} style={{ color: 'var(--critical)', margin: '0 auto 12px' }} />
        <h4 style={{ margin: 0, fontSize: 16 }}>Unable to Load 3D OLAP Cube</h4>
        <p style={{ color: 'var(--text-secondary)', fontSize: 13, margin: '8px 0 16px' }}>
          {error || 'No cube data returned from warehouse.'}
        </p>
        <button onClick={loadData} className="btn btn-primary btn-sm">
          <RefreshCw size={14} /> Retry Loading
        </button>
      </div>
    );
  }

  const { axes, voxels, grand_revenue, grand_units } = cubeData;
  const timeLabels = axes.x.labels;
  const geoLabels = axes.y.labels;
  const catLabels = axes.z.labels;

  // Filter voxels based on slicing planes
  const filteredVoxels = voxels.map((v) => {
    const matchTime = sliceTime === 'ALL' || v.time === sliceTime;
    const matchGeo = sliceGeo === 'ALL' || v.geo === sliceGeo;
    const matchCat = sliceCat === 'ALL' || v.category === sliceCat;
    const isVisible = matchTime && matchGeo && matchCat;
    return { ...v, isVisible };
  });

  // Calculate cell face color based on intensity and active measure
  const getCellColor = (voxel) => {
    const intensity = voxel.intensity || 0.3;
    if (activeMeasure === 'revenue') {
      // Golden Cyan to Emerald
      return `rgba(15, 163, 163, ${0.25 + intensity * 0.65})`;
    } else {
      // Purple to Indigo
      return `rgba(99, 102, 241, ${0.25 + intensity * 0.65})`;
    }
  };

  const cellSize = 38; // cube width/height/depth in px

  return (
    <div>
      {/* Top Banner & 3D Controls */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
          <div>
            <h3 style={{ fontSize: 18, fontWeight: 700, margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
              <Box size={22} style={{ color: 'var(--primary)' }} />
              True 3D Interactive Multidimensional OLAP Cube
            </h3>
            <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 4, maxWidth: 800 }}>
              Visual hypercube rendering <b>Time (X) × Geography (Y) × Medicine Category (Z)</b>. Click and drag anywhere in the 3D canvas to orbit and rotate in 360°.
            </p>
          </div>

          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <button
              onClick={() => setAutoRotate(!autoRotate)}
              className={`btn btn-sm ${autoRotate ? 'btn-primary' : 'btn-secondary'}`}
              title="Toggle Auto Orbit"
            >
              {autoRotate ? <Pause size={14} /> : <Play size={14} />} {autoRotate ? 'Pause Orbit' : 'Auto Rotate'}
            </button>
            <button onClick={resetView} className="btn btn-secondary btn-sm" title="Reset 3D Camera">
              <RotateCcw size={14} /> Reset View
            </button>
          </div>
        </div>

        {/* Slicing & Explode Controls Bar */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12, marginTop: 14, paddingTop: 14, borderTop: '1px solid var(--border)' }}>
          {/* Slice X: Time */}
          <div>
            <span style={{ fontSize: 11, fontWeight: 700, color: '#f59e0b', textTransform: 'uppercase', display: 'block' }}>
              📅 X-Plane Slice (Time):
            </span>
            <select className="select" style={{ fontSize: 12, padding: '4px 8px', marginTop: 4 }} value={sliceTime} onChange={(e) => setSliceTime(e.target.value)}>
              <option value="ALL">All Quarters (Full 3D)</option>
              {timeLabels.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </div>

          {/* Slice Y: Geography */}
          <div>
            <span style={{ fontSize: 11, fontWeight: 700, color: '#10b981', textTransform: 'uppercase', display: 'block' }}>
              🗺️ Y-Plane Slice (Geography):
            </span>
            <select className="select" style={{ fontSize: 12, padding: '4px 8px', marginTop: 4 }} value={sliceGeo} onChange={(e) => setSliceGeo(e.target.value)}>
              <option value="ALL">All Cities (Full 3D)</option>
              {geoLabels.map((g) => (
                <option key={g} value={g}>{g}</option>
              ))}
            </select>
          </div>

          {/* Slice Z: Category */}
          <div>
            <span style={{ fontSize: 11, fontWeight: 700, color: '#8b5cf6', textTransform: 'uppercase', display: 'block' }}>
              💊 Z-Plane Slice (Category):
            </span>
            <select className="select" style={{ fontSize: 12, padding: '4px 8px', marginTop: 4 }} value={sliceCat} onChange={(e) => setSliceCat(e.target.value)}>
              <option value="ALL">All ATC Classes (Full 3D)</option>
              {catLabels.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>

          {/* Explode / Spacing */}
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, fontWeight: 700, color: 'var(--text-muted)' }}>
              <span>💥 EXPLODE SPACING:</span>
              <span>{Math.round((spacing - 45) / 40 * 100)}%</span>
            </div>
            <input
              type="range"
              min="48"
              max="95"
              value={spacing}
              onChange={(e) => setSpacing(Number(e.target.value))}
              style={{ width: '100%', marginTop: 8 }}
            />
          </div>

          {/* Measure Color Mapping */}
          <div>
            <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', display: 'block' }}>
              📊 COLOR CODING MEASURE:
            </span>
            <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
              <button
                onClick={() => setActiveMeasure('revenue')}
                className={`btn btn-sm ${activeMeasure === 'revenue' ? 'btn-primary' : 'btn-secondary'}`}
                style={{ fontSize: 11, flex: 1, padding: '4px 8px' }}
              >
                Revenue (₹)
              </button>
              <button
                onClick={() => setActiveMeasure('units_sold')}
                className={`btn btn-sm ${activeMeasure === 'units_sold' ? 'btn-primary' : 'btn-secondary'}`}
                style={{ fontSize: 11, flex: 1, padding: '4px 8px' }}
              >
                Units Sold
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Main 3D Viewport & Inspector Layout */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 300px', gap: 16 }}>
        {/* 3D Canvas Stage */}
        <div
          ref={containerRef}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
          className="card"
          style={{
            height: 480,
            background: 'radial-gradient(circle at center, var(--bg-surface-hover) 0%, var(--bg-surface) 100%)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: isDragging ? 'grabbing' : 'grab',
            userSelect: 'none',
            overflow: 'hidden',
            position: 'relative'
          }}
        >
          {/* Axis Legend Overlay */}
          <div style={{ position: 'absolute', top: 12, left: 14, fontSize: 11, color: 'var(--text-secondary)', background: 'var(--bg-surface)', padding: '6px 12px', borderRadius: 4, border: '1px solid var(--border)', zIndex: 10 }}>
            <div><span style={{ color: '#f59e0b', fontWeight: 700 }}>■ X-Axis</span>: Time ({timeLabels.length} Quarters)</div>
            <div><span style={{ color: '#10b981', fontWeight: 700 }}>■ Y-Axis</span>: Geography ({geoLabels.length} Cities)</div>
            <div><span style={{ color: '#8b5cf6', fontWeight: 700 }}>■ Z-Axis</span>: Medicine Category ({catLabels.length} Classes)</div>
          </div>

          <div style={{ position: 'absolute', bottom: 12, left: 14, fontSize: 11, color: 'var(--text-muted)', zIndex: 10 }}>
            💡 Tip: Click and drag to rotate the cube in 3D. Click any sub-cube to inspect values.
          </div>

          {/* 3D Scene Container */}
          <div
            style={{
              width: 0,
              height: 0,
              perspective: '1200px',
              perspectiveOrigin: '50% 50%'
            }}
          >
            <div
              style={{
                width: 0,
                height: 0,
                transformStyle: 'preserve-3d',
                transform: `rotateX(${rotX}deg) rotateY(${rotY}deg)`,
                transition: isDragging ? 'none' : 'transform 0.15s ease-out'
              }}
            >
              {/* Render Individual Sub-Cubes / Voxels */}
              {filteredVoxels.map((voxel) => {
                // Offset around center: X centered around (timeLabels.length - 1) / 2
                const cx = (voxel.x - (timeLabels.length - 1) / 2) * spacing;
                const cy = (voxel.y - (geoLabels.length - 1) / 2) * spacing;
                const cz = (voxel.z - (catLabels.length - 1) / 2) * spacing;

                const isSelected = selectedVoxel?.id === voxel.id;
                const baseColor = getCellColor(voxel);
                const opacity = voxel.isVisible ? 1.0 : 0.08;

                return (
                  <div
                    key={voxel.id}
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedVoxel(voxel);
                    }}
                    style={{
                      position: 'absolute',
                      width: cellSize,
                      height: cellSize,
                      transformStyle: 'preserve-3d',
                      transform: `translate3d(${cx}px, ${cy}px, ${cz}px)`,
                      opacity: opacity,
                      cursor: 'pointer',
                      transition: 'opacity 0.25s, transform 0.2s'
                    }}
                  >
                    {/* Front Face */}
                    <div
                      style={{
                        position: 'absolute',
                        width: cellSize,
                        height: cellSize,
                        background: baseColor,
                        border: isSelected ? '2px solid #ffffff' : '1px solid rgba(255,255,255,0.4)',
                        transform: `translateZ(${cellSize / 2}px)`,
                        boxShadow: isSelected ? '0 0 14px rgba(15, 163, 163, 0.9)' : 'none'
                      }}
                    />
                    {/* Back Face */}
                    <div
                      style={{
                        position: 'absolute',
                        width: cellSize,
                        height: cellSize,
                        background: baseColor,
                        border: '1px solid rgba(255,255,255,0.25)',
                        transform: `rotateY(180deg) translateZ(${cellSize / 2}px)`
                      }}
                    />
                    {/* Right Face */}
                    <div
                      style={{
                        position: 'absolute',
                        width: cellSize,
                        height: cellSize,
                        background: baseColor,
                        filter: 'brightness(0.9)',
                        border: '1px solid rgba(255,255,255,0.3)',
                        transform: `rotateY(90deg) translateZ(${cellSize / 2}px)`
                      }}
                    />
                    {/* Left Face */}
                    <div
                      style={{
                        position: 'absolute',
                        width: cellSize,
                        height: cellSize,
                        background: baseColor,
                        filter: 'brightness(0.8)',
                        border: '1px solid rgba(255,255,255,0.25)',
                        transform: `rotateY(-90deg) translateZ(${cellSize / 2}px)`
                      }}
                    />
                    {/* Top Face */}
                    <div
                      style={{
                        position: 'absolute',
                        width: cellSize,
                        height: cellSize,
                        background: baseColor,
                        filter: 'brightness(1.15)',
                        border: '1px solid rgba(255,255,255,0.4)',
                        transform: `rotateX(90deg) translateZ(${cellSize / 2}px)`
                      }}
                    />
                    {/* Bottom Face */}
                    <div
                      style={{
                        position: 'absolute',
                        width: cellSize,
                        height: cellSize,
                        background: baseColor,
                        filter: 'brightness(0.7)',
                        border: '1px solid rgba(255,255,255,0.2)',
                        transform: `rotateX(-90deg) translateZ(${cellSize / 2}px)`
                      }}
                    />
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Selected Voxel Detail Inspector */}
        <div className="card" style={{ padding: 18, display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
              <Layers size={18} style={{ color: 'var(--primary)' }} />
              <h4 style={{ margin: 0, fontSize: 14, textTransform: 'uppercase', color: 'var(--text-primary)' }}>
                3D Cell Inspector
              </h4>
            </div>

            {selectedVoxel ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div style={{ background: 'var(--bg-surface-hover)', padding: '10px 12px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)' }}>
                  <span style={{ fontSize: 11, color: '#f59e0b', fontWeight: 700, display: 'block' }}>TIME (X-AXIS):</span>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>{selectedVoxel.time}</div>
                </div>

                <div style={{ background: 'var(--bg-surface-hover)', padding: '10px 12px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)' }}>
                  <span style={{ fontSize: 11, color: '#10b981', fontWeight: 700, display: 'block' }}>GEOGRAPHY (Y-AXIS):</span>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>{selectedVoxel.geo}</div>
                </div>

                <div style={{ background: 'var(--bg-surface-hover)', padding: '10px 12px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)' }}>
                  <span style={{ fontSize: 11, color: '#8b5cf6', fontWeight: 700, display: 'block' }}>PRODUCT CATEGORY (Z-AXIS):</span>
                  <div style={{ fontSize: 12, fontWeight: 600 }}>{selectedVoxel.category}</div>
                </div>

                <div style={{ padding: '12px', background: 'var(--low-bg)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--primary)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                    <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Gross Revenue:</span>
                    <b style={{ fontSize: 14, color: 'var(--primary)' }}>₹{selectedVoxel.revenue.toLocaleString()}</b>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                    <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Units Dispensed:</span>
                    <b style={{ fontSize: 13 }}>{selectedVoxel.units_sold.toLocaleString()} units</b>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: 6, borderTop: '1px solid rgba(15,163,163,0.3)', fontSize: 11, color: 'var(--text-muted)' }}>
                    <span>Cube Share:</span>
                    <span>{((selectedVoxel.revenue / Math.max(1, grand_revenue)) * 100).toFixed(1)}%</span>
                  </div>
                </div>
              </div>
            ) : (
              <div style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: 13, padding: '30px 0' }}>
                Click any cell in the 3D cube to inspect multidimensional measures.
              </div>
            )}
          </div>

          <div style={{ paddingTop: 14, borderTop: '1px solid var(--border)', fontSize: 11, color: 'var(--text-muted)' }}>
            <div>Total Tensor Cells: <b>{voxels.length}</b></div>
            <div>Cumulative Volume: <b>{grand_units.toLocaleString()} units</b></div>
            <div>Cumulative Value: <b>₹{Math.round(grand_revenue).toLocaleString()}</b></div>
          </div>
        </div>
      </div>
    </div>
  );
}
