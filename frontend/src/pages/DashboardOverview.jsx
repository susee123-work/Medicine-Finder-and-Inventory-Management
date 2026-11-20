import React, { useState, useEffect } from 'react';
import {
  Boxes,
  TrendingDown,
  Truck,
  AlertTriangle,
  Building2,
  RefreshCw,
  MapPin,
  Flame,
  Radio
} from 'lucide-react';
import { api } from '../api/client';
import { useLiveEvents, useLiveSocket } from '../hooks/useLiveSocket';
import KPICard from '../components/KPICard';
import RiskBadge from '../components/RiskBadge';
import LoadingSkeleton from '../components/LoadingSkeleton';
import EmptyState from '../components/EmptyState';
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

export default function DashboardOverview({ onNavigate }) {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [lastSyncedAt, setLastSyncedAt] = useState(null);
  const { status: wsStatus } = useLiveSocket();

  const fetchAnalytics = async (silent = false) => {
    if (!silent) setLoading(true);
    setError(null);
    try {
      const res = await api.community.get();
      setData(res);
      setLastSyncedAt(new Date());
    } catch (err) {
      setError(err.message || 'Failed to load community analytics');
    } finally {
      if (!silent) setLoading(false);
    }
  };

  useEffect(() => {
    fetchAnalytics();
  }, []);

  // Auto-refresh live dashboard whenever backend broadcasts stock, sale, delivery or ETL events
  useLiveEvents(
    ['SALE_RECORDED', 'INVENTORY_UPDATED', 'INVENTORY_BULK_IMPORTED', 'DELIVERY_RECEIVED', 'ETL_COMPLETED'],
    () => {
      fetchAnalytics(true);
    }
  );

  if (loading) {
    return (
      <div>
        <div className="grid-cols-4">
          <LoadingSkeleton height={100} count={4} />
        </div>
        <LoadingSkeleton height={320} count={2} />
      </div>
    );
  }

  if (error) {
    return (
      <EmptyState
        icon={AlertTriangle}
        title="Failed to Load Overview"
        description={error}
        actionText="Retry Loading"
        onAction={fetchAnalytics}
      />
    );
  }

  const localShortages = data?.local_shortages || [];
  const supplierDelays = data?.supplier_delays || [];
  const salesTrend = data?.sales_trend || [];
  const areaHeatmap = data?.area_risk_heatmap || [];
  const criticalCount = localShortages.filter((s) => s.alert === 'possible_local_shortage').length;
  const delayedSuppliersCount = supplierDelays.filter((s) => s.flag).length;

  const chartLabels = salesTrend.map((t) => t.date.slice(5));
  const chartUnits = salesTrend.map((t) => t.units);

  const chartData = {
    labels: chartLabels,
    datasets: [
      {
        label: 'Daily Community Units Sold',
        data: chartUnits,
        borderColor: '#0fa3a3',
        backgroundColor: 'rgba(15, 163, 163, 0.12)',
        fill: true,
        tension: 0.35,
        pointBackgroundColor: '#0fa3a3',
        pointRadius: 3
      }
    ]
  };

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: { padding: 10 }
    },
    scales: {
      y: { beginAtZero: true, grid: { color: 'rgba(0,0,0,0.05)' } },
      x: { grid: { display: false } }
    }
  };

  return (
    <div>
      {/* Page Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <h2 style={{ fontSize: 22, fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>
              Executive Shortage Intelligence Overview
            </h2>
            <span style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 5,
              fontSize: 11,
              fontWeight: 700,
              padding: '3px 9px',
              borderRadius: 999,
              background: wsStatus === 'connected' ? 'var(--low-bg)' : 'var(--medium-bg)',
              color: wsStatus === 'connected' ? 'var(--low)' : 'var(--high)',
            }}>
              <Radio size={12} />
              {wsStatus === 'connected' ? 'WebSocket Live' : 'Syncing…'}
            </span>
          </div>
          <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 2 }}>
            Real-time surveillance across {data?.pharmacies_count ?? 0} community pharmacies
            {lastSyncedAt ? ` • Synced ${lastSyncedAt.toLocaleTimeString()}` : ''}.
          </p>
        </div>
        <button className="btn btn-secondary btn-sm" onClick={() => fetchAnalytics(false)}>
          <RefreshCw size={14} /> Refresh Surveillance
        </button>
      </div>

      {/* KPI Cards */}
      <div className="grid-cols-4">
        <KPICard
          title="Pharmacies Monitored"
          value={data?.pharmacies_count ?? 0}
          subtext="Active in live network"
          icon={Building2}
          trend={wsStatus === 'connected' ? 'Live WS' : 'Synced'}
          trendColor="var(--primary)"
        />
        <KPICard
          title="Critical Regional Shortages"
          value={criticalCount}
          subtext="Affecting ≥40% pharmacies"
          icon={TrendingDown}
          trend={criticalCount > 0 ? 'Action Required' : 'Normal'}
          trendColor={criticalCount > 0 ? 'var(--critical)' : 'var(--low)'}
        />
        <KPICard
          title="Delayed Suppliers"
          value={delayedSuppliersCount}
          subtext="≥30% latency rate"
          icon={Truck}
          trend={delayedSuppliersCount > 0 ? 'High Latency' : 'Punctual'}
          trendColor={delayedSuppliersCount > 0 ? 'var(--high)' : 'var(--low)'}
        />
        <KPICard
          title="Monitored Areas"
          value={areaHeatmap.length}
          subtext="Zones & districts tracked"
          icon={MapPin}
          trend="Live Telemetry"
          trendColor="var(--primary)"
        />
      </div>

      {/* Sales Trend & Regional Heat Map */}
      <div className="grid-cols-2">
        {/* Trend Chart */}
        <div className="card">
          <div className="card-header">
            <span className="card-title">
              <Boxes size={18} style={{ color: 'var(--primary)' }} />
              14-Day Network Sales Volume Trend
            </span>
            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Aggregated units/day</span>
          </div>
          <div style={{ height: 260 }}>
            {salesTrend.length > 0 ? (
              <Line data={chartData} options={chartOptions} />
            ) : (
              <EmptyState title="No recent sales trend data" />
            )}
          </div>
        </div>

        {/* Regional Heatmap */}
        <div className="card">
          <div className="card-header">
            <span className="card-title">
              <Flame size={18} style={{ color: 'var(--critical)' }} />
              Regional Shortage Risk Heat Map
            </span>
            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Vulnerability index by locality</span>
          </div>
          <div className="table-responsive" style={{ maxHeight: 260, overflowY: 'auto' }}>
            <table>
              <thead>
                <tr>
                  <th>City / District</th>
                  <th>At-Risk Medicines</th>
                  <th>Pharmacies</th>
                  <th>Risk Index</th>
                </tr>
              </thead>
              <tbody>
                {areaHeatmap.map((area, idx) => (
                  <tr key={idx}>
                    <td><b>{area.city}</b></td>
                    <td>{area.at_risk_medicines_count} meds</td>
                    <td>{area.pharmacies_monitored}</td>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <div style={{ flex: 1, background: 'var(--border-light)', height: 6, borderRadius: 3, overflow: 'hidden' }}>
                          <div style={{
                            width: `${area.risk_index}%`,
                            height: '100%',
                            background: area.risk_index >= 60 ? 'var(--critical)' : (area.risk_index >= 30 ? 'var(--high)' : 'var(--low)')
                          }} />
                        </div>
                        <span style={{ fontSize: 12, fontWeight: 600 }}>{area.risk_index}/100</span>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Bottom Tables: Local Shortages & Supplier Latency */}
      <div className="grid-cols-2">
        {/* Local Shortages */}
        <div className="card">
          <div className="card-header">
            <span className="card-title">
              <AlertTriangle size={18} style={{ color: 'var(--accent)' }} />
              Community Shortage Convergence
            </span>
            <button className="btn btn-secondary btn-sm" onClick={() => onNavigate && onNavigate('predictions')}>
              View Predictions
            </button>
          </div>
          <div className="table-responsive">
            <table>
              <thead>
                <tr>
                  <th>Medicine</th>
                  <th>Affected Pharmacies</th>
                  <th>Community Penetration</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {localShortages.slice(0, 7).map((s, idx) => (
                  <tr key={idx}>
                    <td><b>{s.medicine}</b></td>
                    <td>{s.pharmacies_at_risk} stores</td>
                    <td>{s.pct_pharmacies}%</td>
                    <td>
                      <RiskBadge level={s.alert === 'possible_local_shortage' ? 'critical' : 'high'} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Supplier Latency */}
        <div className="card">
          <div className="card-header">
            <span className="card-title">
              <Truck size={18} style={{ color: 'var(--primary)' }} />
              Supplier Fulfillment Latency Surveillance
            </span>
            <button className="btn btn-secondary btn-sm" onClick={() => onNavigate && onNavigate('olap')}>
              OLAP Cube
            </button>
          </div>
          <div className="table-responsive">
            <table>
              <thead>
                <tr>
                  <th>Distributor / Supplier</th>
                  <th>Deliveries</th>
                  <th>Late</th>
                  <th>Avg Delay</th>
                  <th>Fulfillment Rate</th>
                </tr>
              </thead>
              <tbody>
                {supplierDelays.slice(0, 7).map((sup, idx) => (
                  <tr key={idx}>
                    <td><b>{sup.supplier}</b></td>
                    <td>{sup.deliveries}</td>
                    <td style={{ color: sup.late > 0 ? 'var(--critical)' : 'inherit' }}>
                      {sup.late}
                    </td>
                    <td>{sup.avg_delay_days} days</td>
                    <td>
                      <span className={`badge ${sup.fill_rate_pct >= 95 ? 'badge-low' : 'badge-high'}`}>
                        {sup.fill_rate_pct}%
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}

