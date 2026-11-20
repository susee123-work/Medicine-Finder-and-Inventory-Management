import React, { useState } from 'react';
import {
  LayoutDashboard,
  Boxes,
  TrendingDown,
  Database,
  BrainCircuit,
  Search,
  Bell,
  Sun,
  Moon,
  Activity,
  Building2,
  LogOut,
  Radio,
  Wifi,
  WifiOff,
} from 'lucide-react';
import ErrorBoundary from './ErrorBoundary';
import { useLiveSocket } from '../hooks/useLiveSocket';

const ROLE_COLOR = {
  pharmacy_admin: '#D95D39',
  pharmacy_staff: '#0D9468',
  health_official: '#C27803',
  patient: '#EA580C',
};

const ROLE_LABEL = {
  pharmacy_admin: 'Pharmacy Admin',
  pharmacy_staff: 'Pharmacy Staff',
  health_official: 'Health Official',
  patient: 'Patient',
};

export default function Layout({ activeTab, onTabChange, children, currentUser, onLogout }) {
  const [theme, setTheme] = useState(() => {
    const saved = localStorage.getItem('medipulse_theme') || 'dark';
    document.documentElement.setAttribute('data-theme', saved);
    return saved;
  });
  const [showLiveFeed, setShowLiveFeed] = useState(false);

  const { status: wsStatus, clientsCount, liveMetrics, eventFeed } = useLiveSocket();
  const isConnected = wsStatus === 'connected';

  const toggleTheme = () => {
    setTheme((prev) => {
      const next = prev === 'light' ? 'dark' : 'light';
      document.documentElement.setAttribute('data-theme', next);
      localStorage.setItem('medipulse_theme', next);
      return next;
    });
  };

  const role = currentUser?.role || 'patient';
  const accent = ROLE_COLOR[role] || '#D95D39';
  const pharmacyName = currentUser?.pharmacy_name;

  const navItems = [
    { id: 'overview', label: 'Overview & KPIs', icon: LayoutDashboard },
    { id: 'inventory', label: 'Inventory (FEFO)', icon: Boxes, roles: ['pharmacy_admin', 'pharmacy_staff', 'health_official'] },
    { id: 'predictions', label: 'Shortage Predictions', icon: TrendingDown, roles: ['pharmacy_admin', 'pharmacy_staff', 'health_official'] },
    { id: 'olap', label: 'OLAP Warehouse', icon: Database, roles: ['pharmacy_admin', 'health_official'] },
    { id: 'mining', label: 'Data Mining Studio', icon: BrainCircuit, roles: ['pharmacy_admin', 'health_official'] },
    { id: 'finder', label: 'Patient Medicine Finder', icon: Search },
    { id: 'alerts', label: 'Restock Alerts & Digest', icon: Bell },
  ];

  const visibleNavItems = navItems.filter(
    (item) => !item.roles || item.roles.includes(role)
  );

  return (
    <div className="app-container">
      {/* Sidebar Navigation */}
      <aside className="sidebar">
        <div style={{ padding: '20px 20px 16px', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{
              width: 36,
              height: 36,
              borderRadius: 8,
              background: accent,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#ffffff',
            }}>
              <Activity size={22} />
            </div>
            <div>
              <h1 style={{ fontSize: 18, fontWeight: 700, letterSpacing: -0.5, color: '#ffffff', margin: 0 }}>
                MediPulse <span style={{ color: accent }}>AI</span>
              </h1>
              <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Warehouse &amp; Mining Intel</span>
            </div>
          </div>
        </div>

        {/* Role badge */}
        <div style={{
          padding: '10px 20px',
          background: accent + '18',
          borderBottom: '1px solid rgba(255,255,255,0.05)',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
        }}>
          <span style={{
            fontSize: 10,
            fontWeight: 700,
            padding: '2px 8px',
            borderRadius: 20,
            background: accent + '30',
            color: accent,
            textTransform: 'uppercase',
            letterSpacing: 0.6,
          }}>
            {ROLE_LABEL[role] || role}
          </span>
        </div>

        {/* Pharmacy context */}
        {pharmacyName && role !== 'patient' && role !== 'health_official' && (
          <div style={{ padding: '12px 20px', background: 'rgba(255,255,255,0.03)', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
            <span style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.8, color: 'var(--text-muted)' }}>
              Assigned Pharmacy
            </span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 2, color: 'var(--text-on-dark)', fontSize: 13, fontWeight: 500 }}>
              <Building2 size={14} style={{ color: accent }} />
              <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {pharmacyName}
              </span>
            </div>
          </div>
        )}

        {/* Navigation Menu */}
        <nav style={{ padding: '16px 12px', flex: 1, display: 'flex', flexDirection: 'column', gap: 4 }}>
          {visibleNavItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => onTabChange(item.id)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  padding: '10px 14px',
                  borderRadius: 'var(--radius-sm)',
                  fontSize: 14,
                  fontWeight: 500,
                  border: 'none',
                  cursor: 'pointer',
                  textAlign: 'left',
                  transition: 'all 0.15s ease',
                  background: isActive ? accent : 'transparent',
                  color: isActive ? '#ffffff' : 'var(--text-muted)',
                }}
              >
                <Icon size={18} />
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>

        {/* Live WebSocket Status Pill (Dynamic, not static!) */}
        <div style={{ padding: '14px 18px', borderTop: '1px solid rgba(255,255,255,0.08)', fontSize: 12, color: 'var(--text-muted)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
              <span style={{
                width: 8,
                height: 8,
                borderRadius: '50%',
                background: isConnected ? '#22c55e' : '#f59e0b',
                boxShadow: isConnected ? '0 0 8px #22c55e' : 'none',
                display: 'inline-block',
              }} />
              <span style={{ color: isConnected ? '#e2e8f0' : '#fbbf24', fontWeight: 600 }}>
                {isConnected ? 'WebSocket Live' : 'Reconnecting…'}
              </span>
            </div>
            {isConnected && (
              <span style={{ fontSize: 11, color: '#94a3b8' }}>
                {clientsCount} online
              </span>
            )}
          </div>
          {liveMetrics && (
            <div style={{ fontSize: 11, color: '#94a3b8', display: 'flex', gap: 10 }}>
              <span>{liveMetrics.batches} batches</span>
              <span>•</span>
              <span>{liveMetrics.sales} sales</span>
            </div>
          )}
        </div>
      </aside>

      {/* Main Container */}
      <div className="main-content">
        {/* Top Navbar */}
        <header className="top-navbar">
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{
              fontSize: 11,
              fontWeight: 700,
              padding: '3px 10px',
              borderRadius: 20,
              background: accent + '20',
              color: accent,
              textTransform: 'uppercase',
              letterSpacing: 0.6,
              border: `1px solid ${accent}40`,
            }}>
              {ROLE_LABEL[role] || role} Portal
            </span>
          </div>

          {/* Right controls */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, position: 'relative' }}>
            {/* Real-Time WebSocket Event Feed Button */}
            <div style={{ position: 'relative' }}>
              <button
                type="button"
                onClick={() => setShowLiveFeed((v) => !v)}
                style={{
                  background: 'transparent',
                  border: '1px solid var(--border)',
                  borderRadius: 'var(--radius-sm)',
                  padding: '6px 10px',
                  cursor: 'pointer',
                  color: isConnected ? 'var(--text-primary)' : '#f59e0b',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  fontSize: 12,
                  fontWeight: 600,
                }}
                title="Live WebSocket activity stream"
              >
                {isConnected ? <Wifi size={15} color="#22c55e" /> : <WifiOff size={15} color="#f59e0b" />}
                <span>Live Feed</span>
                {eventFeed.length > 0 && (
                  <span style={{
                    background: accent,
                    color: '#fff',
                    borderRadius: 999,
                    padding: '1px 6px',
                    fontSize: 10,
                    fontWeight: 700,
                  }}>
                    {eventFeed.length}
                  </span>
                )}
              </button>

              {showLiveFeed && (
                <div style={{
                  position: 'absolute',
                  right: 0,
                  top: 'calc(100% + 8px)',
                  width: 340,
                  maxHeight: 380,
                  overflowY: 'auto',
                  background: 'var(--bg-surface)',
                  border: '1px solid var(--border)',
                  borderRadius: 'var(--radius-md)',
                  boxShadow: 'var(--shadow-lg)',
                  zIndex: 300,
                  padding: 12,
                }}>
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    paddingBottom: 8,
                    marginBottom: 8,
                    borderBottom: '1px solid var(--border)',
                    fontSize: 12,
                    fontWeight: 700,
                  }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <Radio size={14} color={isConnected ? '#22c55e' : '#f59e0b'} />
                      Real-Time Event Stream
                    </span>
                    <span style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 500 }}>
                      {isConnected ? `${clientsCount} connected` : 'Offline'}
                    </span>
                  </div>

                  {eventFeed.length === 0 ? (
                    <div style={{ fontSize: 12, color: 'var(--text-muted)', textAlign: 'center', padding: '18px 8px' }}>
                      Listening for live inventory, sales, delivery &amp; ETL events…
                    </div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {eventFeed.slice(0, 12).map((ev, idx) => (
                        <div
                          key={`${ev.timestamp}-${idx}`}
                          style={{
                            padding: '8px 10px',
                            borderRadius: 8,
                            background: 'var(--bg-surface-hover)',
                            borderLeft: `3px solid ${accent}`,
                            fontSize: 12,
                          }}
                        >
                          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginBottom: 2 }}>
                            <span style={{ fontWeight: 700, fontSize: 10.5, color: accent }}>
                              {ev.type.replace(/_/g, ' ')}
                            </span>
                            <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>
                              {new Date(ev.timestamp).toLocaleTimeString()}
                            </span>
                          </div>
                          <div style={{ color: 'var(--text-primary)' }}>
                            {ev.summary || 'Live state synchronized'}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-primary)' }}>
              {currentUser?.full_name || currentUser?.name || 'User'}
            </div>

            <button
              onClick={toggleTheme}
              aria-label="Toggle dark/light theme"
              style={{
                background: 'transparent',
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius-sm)',
                padding: '6px 10px',
                cursor: 'pointer',
                color: 'var(--text-primary)',
                display: 'flex',
                alignItems: 'center',
              }}
            >
              {theme === 'light' ? <Moon size={18} /> : <Sun size={18} />}
            </button>

            <button
              onClick={onLogout}
              title="Sign out"
              style={{
                background: 'transparent',
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius-sm)',
                padding: '6px 10px',
                cursor: 'pointer',
                color: '#ef4444',
                display: 'flex',
                alignItems: 'center',
                gap: 5,
                fontSize: 13,
              }}
            >
              <LogOut size={16} />
              <span>Sign Out</span>
            </button>
          </div>
        </header>

        {/* Dynamic Body Content */}
        <main className="page-body">
          <ErrorBoundary>
            {children}
          </ErrorBoundary>
        </main>
      </div>
    </div>
  );
}
