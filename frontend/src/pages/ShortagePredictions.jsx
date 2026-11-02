import React, { useState, useEffect } from 'react';
import {
  TrendingDown,
  ChevronRight,
  RefreshCw
} from 'lucide-react';
import { api } from '../api/client';
import RiskBadge from '../components/RiskBadge';
import LoadingSkeleton from '../components/LoadingSkeleton';
import EmptyState from '../components/EmptyState';
import Modal from '../components/Modal';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler
} from 'chart.js';
import { Line } from 'react-chartjs-2';

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler
);

export default function ShortagePredictions() {
  const [loading, setLoading] = useState(true);
  const [pharmacies, setPharmacies] = useState([]);
  const [pharmacyId, setPharmacyId] = useState('');
  const [horizon, setHorizon] = useState(7);
  const [predictions, setPredictions] = useState([]);
  const [selectedMedDetail, setSelectedMedDetail] = useState(null);
  const [detailModalOpen, setDetailModalOpen] = useState(false);
  const [loadingDetail, setLoadingDetail] = useState(false);

  const loadData = async (pid, h = horizon) => {
    setLoading(true);
    try {
      const pharms = await api.pharmacies.list();
      setPharmacies(pharms);
      const chosenId = pid || pharms[0]?.id;
      setPharmacyId(chosenId);

      const preds = await api.predictions.shortages(chosenId, h);
      setPredictions(preds);
    } catch (err) {
      console.error('Failed to load predictions:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [horizon]);

  const handlePharmacyChange = (e) => {
    const newId = e.target.value;
    setPharmacyId(newId);
    loadData(newId, horizon);
  };

  const handleOpenDetail = async (medId) => {
    setLoadingDetail(true);
    setDetailModalOpen(true);
    try {
      const detail = await api.predictions.detail(medId, pharmacyId, horizon);
      setSelectedMedDetail(detail);
    } catch (err) {
      console.error('Failed to load detail:', err);
    } finally {
      setLoadingDetail(false);
    }
  };

  // Prepare chart for detail modal
  const chartData = selectedMedDetail ? {
    labels: selectedMedDetail.forecast_series.map((f) => f.date.slice(5)),
    datasets: [
      {
        label: 'Mean Forecast Demand',
        data: selectedMedDetail.forecast_series.map((f) => f.mean),
        borderColor: '#0fa3a3',
        backgroundColor: 'rgba(15, 163, 163, 0.15)',
        tension: 0.3
      },
      {
        label: 'Upper 95% Confidence Bound',
        data: selectedMedDetail.forecast_series.map((f) => f.upper),
        borderColor: '#f28c28',
        borderDash: [5, 5],
        fill: false
      },
      {
        label: 'Lower 95% Confidence Bound',
        data: selectedMedDetail.forecast_series.map((f) => f.lower),
        borderColor: '#f28c28',
        borderDash: [5, 5],
        fill: false
      }
    ]
  } : null;

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h2 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>
            Predictive Stockout Intelligence & 7-Day Forecasting
          </h2>
          <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 2 }}>
            Holt-Winters exponential smoothing, day-of-week seasonality, confidence intervals, and safety stocks.
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <select className="select" value={pharmacyId} onChange={handlePharmacyChange} style={{ fontWeight: 600 }}>
            {pharmacies.map((p) => (
              <option key={p.id} value={p.id}>{p.name} ({p.city})</option>
            ))}
          </select>

          <div style={{ display: 'flex', background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', overflow: 'hidden' }}>
            {[7, 14, 30].map((h) => (
              <button
                key={h}
                onClick={() => setHorizon(h)}
                style={{
                  padding: '6px 12px',
                  border: 'none',
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: 'pointer',
                  background: horizon === h ? 'var(--primary)' : 'transparent',
                  color: horizon === h ? '#ffffff' : 'var(--text-secondary)'
                }}
              >
                {h} Days
              </button>
            ))}
          </div>

          <button className="btn btn-secondary btn-sm" onClick={() => loadData(pharmacyId, horizon)}>
            <RefreshCw size={14} /> Refresh
          </button>
        </div>
      </div>

      {loading ? (
        <div className="grid-cols-2">
          <LoadingSkeleton height={180} count={6} />
        </div>
      ) : predictions.length === 0 ? (
        <EmptyState
          icon={TrendingDown}
          title="No Shortage Risks Detected"
          description="All stocked medicines maintain healthy inventory buffers exceeding the current forecast horizon."
        />
      ) : (
        <div className="grid-cols-2">
          {predictions.map((p) => (
            <div
              key={p.medicine_id}
              className="card"
              style={{
                borderLeft: `4px solid ${
                  p.risk_level === 'CRITICAL' ? 'var(--critical)' : (p.risk_level === 'HIGH' ? 'var(--high)' : 'var(--primary)')
                }`
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
                <div>
                  <h3 style={{ fontSize: 16, fontWeight: 700, margin: 0, color: 'var(--text-primary)' }}>
                    {p.medicine}
                  </h3>
                  <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                    {p.generic_name} • {p.category}
                  </span>
                </div>
                <RiskBadge level={p.risk_level} score={p.risk_score} />
              </div>

              {/* Metrics Grid */}
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(3, 1fr)',
                gap: 8,
                background: 'var(--bg-surface-hover)',
                padding: 10,
                borderRadius: 'var(--radius-sm)',
                marginBottom: 12,
                fontSize: 12
              }}>
                <div>
                  <span style={{ color: 'var(--text-muted)', display: 'block' }}>Stock On Hand</span>
                  <b style={{ fontSize: 14, color: p.stock < 10 ? 'var(--critical)' : 'inherit' }}>
                    {p.stock} units
                  </b>
                </div>
                <div>
                  <span style={{ color: 'var(--text-muted)', display: 'block' }}>Days of Cover</span>
                  <b style={{ fontSize: 14, color: p.days_cover <= p.lead_time_days ? 'var(--critical)' : 'inherit' }}>
                    {p.days_cover} days
                  </b>
                </div>
                <div>
                  <span style={{ color: 'var(--text-muted)', display: 'block' }}>Demand Velocity</span>
                  <b style={{ fontSize: 14 }}>
                    {p.daily_demand} / day
                  </b>
                </div>
                <div>
                  <span style={{ color: 'var(--text-muted)', display: 'block' }}>Lead Time</span>
                  <b>{p.lead_time_days} days</b>
                </div>
                <div>
                  <span style={{ color: 'var(--text-muted)', display: 'block' }}>Safety Stock (Z=1.65)</span>
                  <b>{p.safety_stock} units</b>
                </div>
                <div>
                  <span style={{ color: 'var(--text-muted)', display: 'block' }}>Backtest MAPE</span>
                  <b style={{ color: 'var(--primary)' }}>{p.mape}%</b>
                </div>
              </div>

              {/* Top Contributing Risk Factors */}
              <div style={{ marginBottom: 12 }}>
                <span style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', color: 'var(--text-muted)', letterSpacing: 0.5 }}>
                  Key Risk Drivers & Reasoning:
                </span>
                <div style={{ marginTop: 4, display: 'flex', flexDirection: 'column', gap: 3 }}>
                  {p.top_risk_factors.slice(0, 3).map((f, i) => (
                    <div key={i} style={{ fontSize: 12, color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ width: 4, height: 4, borderRadius: '50%', background: 'var(--accent)' }}></span>
                      <span>{f}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Reorder Recommendation Pill */}
              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                paddingTop: 10,
                borderTop: '1px solid var(--border-light)'
              }}>
                <div>
                  {p.reorder_now ? (
                    <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--critical)' }}>
                      Reorder Now! Order Suggested: <b>{p.suggested_order_qty} units</b>
                    </span>
                  ) : (
                    <span style={{ fontSize: 12, color: 'var(--low)' }}>
                      Buffer Stable (ROP: {p.reorder_point})
                    </span>
                  )}
                </div>
                <button
                  className="btn btn-secondary btn-sm"
                  onClick={() => handleOpenDetail(p.medicine_id)}
                >
                  Inspect Forecast <ChevronRight size={14} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* DETAIL MODAL: In-Depth Diagnostic & Confidence Interval Trajectory */}
      <Modal
        isOpen={detailModalOpen}
        onClose={() => setDetailModalOpen(false)}
        title={selectedMedDetail ? `Forecast Diagnostics: ${selectedMedDetail.medicine}` : 'Loading...'}
        maxWidth={720}
      >
        {loadingDetail || !selectedMedDetail ? (
          <LoadingSkeleton height={180} count={2} />
        ) : (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <div>
                <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                  Model: <b>{selectedMedDetail.model_used}</b> (Backtested MAPE: {selectedMedDetail.mape}%)
                </span>
                <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                  Cycle Service Level: 95% ($Z=1.65$) • Lead Time Variance Buffer Included
                </div>
              </div>
              <RiskBadge level={selectedMedDetail.risk_level} score={selectedMedDetail.risk_score} />
            </div>

            {/* Trajectory Chart */}
            <div style={{ height: 260, marginBottom: 20 }}>
              <Line data={chartData} options={{ responsive: true, maintainAspectRatio: false }} />
            </div>

            {/* Explanation Factors */}
            <div style={{ background: 'var(--bg-surface-hover)', padding: 12, borderRadius: 'var(--radius-sm)' }}>
              <h4 style={{ fontSize: 13, fontWeight: 600, marginBottom: 6 }}>Diagnostic Decomposition:</h4>
              {selectedMedDetail.factors.map((f, i) => (
                <div key={i} style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 2 }}>
                  • {f}
                </div>
              ))}
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}

