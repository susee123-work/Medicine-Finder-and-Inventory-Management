import React, { useState, useEffect } from 'react';
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
  ShieldCheck,
  Building2,
  ChevronDown,
  UserCheck
} from 'lucide-react';
import { api, getStoredToken, setStoredToken, getStoredUser, setStoredUser } from '../api/client';
import ErrorBoundary from './ErrorBoundary';

export default function Layout({ activeTab, onTabChange, children }) {
  const [theme, setTheme] = useState(localStorage.getItem('medipulse_theme') || 'light');
  const [currentUser, setCurrentUser] = useState(getStoredUser() || { role: 'pharmacy_admin', full_name: 'Dr. Sarah Chen' });
  const [demoTokens, setDemoTokens] = useState([]);
  const [showRoleMenu, setShowRoleMenu] = useState(false);
  const [pharmacyName, setPharmacyName] = useState('Apollo Pharmacy Main Branch');

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('medipulse_theme', theme);
  }, [theme]);

  useEffect(() => {
    // Load demo tokens for role switcher
    api.auth.getDemoTokens()
      .then((tokens) => {
        setDemoTokens(tokens);
        if (!getStoredToken() && tokens.length > 0) {
          const adminTok = tokens.find((t) => t.role === 'pharmacy_admin') || tokens[0];
          setStoredToken(adminTok.access_token);
          setStoredUser(adminTok);
          setCurrentUser(adminTok);
          if (adminTok.pharmacy_name) setPharmacyName(adminTok.pharmacy_name);
        }
      })
      .catch((err) => console.warn('Could not load demo tokens:', err));
  }, []);

  const toggleTheme = () => {
    setTheme((prev) => (prev === 'light' ? 'dark' : 'light'));
  };

  const handleSwitchRole = (tokenItem) => {
    setStoredToken(tokenItem.access_token);
    setStoredUser(tokenItem);
    setCurrentUser(tokenItem);
    if (tokenItem.pharmacy_name) setPharmacyName(tokenItem.pharmacy_name);
    setShowRoleMenu(false);
  };

  const navItems = [
    { id: 'overview', label: 'Overview & KPIs', icon: LayoutDashboard },
    { id: 'inventory', label: 'Inventory (FEFO)', icon: Boxes, roles: ['pharmacy_admin', 'pharmacy_staff', 'health_official'] },
    { id: 'predictions', label: 'Shortage Predictions', icon: TrendingDown, roles: ['pharmacy_admin', 'pharmacy_staff', 'health_official'] },
    { id: 'olap', label: 'OLAP Warehouse', icon: Database, roles: ['pharmacy_admin', 'health_official'] },
    { id: 'mining', label: 'Data Mining Studio', icon: BrainCircuit, roles: ['pharmacy_admin', 'health_official'] },
    { id: 'finder', label: 'Patient Medicine Finder', icon: Search },
    { id: 'alerts', label: 'Restock Alerts & Digest', icon: Bell }
  ];

  const visibleNavItems = navItems.filter(
    (item) => !item.roles || item.roles.includes(currentUser?.role || 'patient')
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
              background: 'var(--primary)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#ffffff'
            }}>
              <Activity size={22} />
            </div>
            <div>
              <h1 style={{ fontSize: 18, fontWeight: 700, letterSpacing: -0.5, color: '#ffffff', margin: 0 }}>
                MediPulse <span style={{ color: 'var(--primary)' }}>AI</span>
              </h1>
              <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Warehouse & Mining Intel</span>
            </div>
          </div>
        </div>

        {/* Pharmacy context */}
        {pharmacyName && currentUser.role !== 'patient' && currentUser.role !== 'health_official' && (
          <div style={{ padding: '12px 20px', background: 'rgba(255,255,255,0.03)', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
            <span style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.8, color: 'var(--text-muted)' }}>
              Assigned Pharmacy
            </span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 2, color: 'var(--text-on-dark)', fontSize: 13, fontWeight: 500 }}>
              <Building2 size={14} style={{ color: 'var(--primary)' }} />
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
                  background: isActive ? 'var(--primary)' : 'transparent',
                  color: isActive ? '#ffffff' : 'var(--text-muted)'
                }}
              >
                <Icon size={18} />
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>

        {/* System Status pill */}
        <div style={{ padding: '16px 20px', borderTop: '1px solid rgba(255,255,255,0.08)', fontSize: 12, color: 'var(--text-muted)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#22c55e' }}></span>
            <span>FastAPI + Supabase DW Live</span>
          </div>
        </div>
      </aside>

      {/* Main Container */}
      <div className="main-content">
        {/* Top Navbar */}
        <header className="top-navbar">
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>Operating Mode:</span>
            {/* Role Switcher Pill */}
            <div style={{ position: 'relative' }}>
              <button
                className="btn btn-secondary btn-sm"
                onClick={() => setShowRoleMenu((v) => !v)}
                style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 600 }}
              >
                <ShieldCheck size={16} style={{ color: 'var(--primary)' }} />
                <span>Role: {currentUser?.role?.replace('_', ' ').toUpperCase()}</span>
                <ChevronDown size={14} />
              </button>

              {showRoleMenu && (
                <div style={{
                  position: 'absolute',
                  top: '100%',
                  left: 0,
                  marginTop: 6,
                  background: 'var(--bg-surface)',
                  border: '1px solid var(--border)',
                  borderRadius: 'var(--radius-md)',
                  boxShadow: 'var(--shadow-md)',
                  minWidth: 240,
                  zIndex: 200,
                  padding: 6
                }}>
                  <div style={{ padding: '6px 10px', fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
                    Switch Demo Persona
                  </div>
                  {demoTokens.map((t) => (
                    <button
                      key={t.role}
                      onClick={() => handleSwitchRole(t)}
                      style={{
                        width: '100%',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '8px 10px',
                        background: currentUser.role === t.role ? 'var(--primary-light)' : 'transparent',
                        color: currentUser.role === t.role ? 'var(--primary)' : 'var(--text-primary)',
                        border: 'none',
                        borderRadius: 'var(--radius-sm)',
                        cursor: 'pointer',
                        fontSize: 13,
                        textAlign: 'left'
                      }}
                    >
                      <div>
                        <div style={{ fontWeight: 600 }}>{t.role.replace('_', ' ').toUpperCase()}</div>
                        <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{t.name}</div>
                      </div>
                      {currentUser.role === t.role && <UserCheck size={16} />}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Right controls */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
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
                alignItems: 'center'
              }}
            >
              {theme === 'light' ? <Moon size={18} /> : <Sun size={18} />}
            </button>
            <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-primary)' }}>
              {currentUser?.name || currentUser?.full_name || 'User'}
            </div>
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

