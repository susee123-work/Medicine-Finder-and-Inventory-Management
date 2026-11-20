import React, { useState, useEffect } from 'react';
import Layout from './components/Layout';
import DashboardOverview from './pages/DashboardOverview';
import InventoryManager from './pages/InventoryManager';
import ShortagePredictions from './pages/ShortagePredictions';
import OLAPExplorer from './pages/OLAPExplorer';
import DataMiningStudio from './pages/DataMiningStudio';
import PatientFinder from './pages/PatientFinder';
import RestockAlerts from './pages/RestockAlerts';
import PortalSelector from './pages/PortalSelector';
import { PORTALS } from './config/portals';
import LoginPage from './pages/LoginPage';
import WebSocketProvider from './context/WebSocketProvider';
import { getStoredToken, getStoredUser, clearAuth } from './api/client';

function resolvePortalFromPath(pathname) {
  const clean = (pathname || '/').replace(/\/+$/, '').toLowerCase();
  return PORTALS.find(
    (p) => clean === p.path || clean === `/login/${p.role}`
  ) || null;
}

export default function App() {
  const [authPhase, setAuthPhase] = useState('loading'); // 'loading' | 'portal' | 'login' | 'app'
  const [selectedPortal, setSelectedPortal] = useState(null);
  const [currentUser, setCurrentUser] = useState(null);
  const [activeTab, setActiveTab] = useState('overview');

  // Initialize from session or direct portal URL (/login/admin, /login/staff, /login/official, /login/patient)
  useEffect(() => {
    const syncFromLocation = () => {
      const urlPortal = resolvePortalFromPath(window.location.pathname);
      const token = getStoredToken();
      const user = getStoredUser();

      if (urlPortal) {
        // Explicit portal URL requested — if logged in as a different role or logged out, open that login page
        if (token && user && user.role === urlPortal.role) {
          setCurrentUser(user);
          setActiveTab(user.role === 'patient' ? 'finder' : 'overview');
          setAuthPhase('app');
        } else {
          setSelectedPortal(urlPortal);
          setAuthPhase('login');
        }
        return;
      }

      if (token && user) {
        setCurrentUser(user);
        setActiveTab(user.role === 'patient' ? 'finder' : 'overview');
        setAuthPhase('app');
      } else {
        setSelectedPortal(null);
        setAuthPhase('portal');
      }
    };

    syncFromLocation();
    window.addEventListener('popstate', syncFromLocation);
    return () => window.removeEventListener('popstate', syncFromLocation);
  }, []);

  const handlePortalSelect = (portal) => {
    setSelectedPortal(portal);
    setAuthPhase('login');
    window.history.pushState({}, '', portal.path);
  };

  const handleBackToPortals = () => {
    setSelectedPortal(null);
    setAuthPhase('portal');
    window.history.pushState({}, '', '/');
  };

  const handleLoginSuccess = (user) => {
    setCurrentUser(user);
    setAuthPhase('app');
    setActiveTab(user.role === 'patient' ? 'finder' : 'overview');
    window.history.pushState({}, '', '/');
  };

  const handleLogout = () => {
    clearAuth();
    setCurrentUser(null);
    setSelectedPortal(null);
    setAuthPhase('portal');
    setActiveTab('overview');
    window.history.pushState({}, '', '/');
  };

  const renderContent = () => {
    switch (activeTab) {
      case 'overview':
        return <DashboardOverview onNavigate={(tab) => setActiveTab(tab)} />;
      case 'inventory':
        return <InventoryManager />;
      case 'predictions':
        return <ShortagePredictions />;
      case 'olap':
        return <OLAPExplorer />;
      case 'mining':
        return <DataMiningStudio />;
      case 'finder':
        return <PatientFinder />;
      case 'alerts':
        return <RestockAlerts />;
      default:
        return <DashboardOverview onNavigate={(tab) => setActiveTab(tab)} />;
    }
  };

  if (authPhase === 'loading') {
    return (
      <div style={{
        minHeight: '100vh',
        background: '#F7F4EE',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: '#141210',
        fontFamily: "'Plus Jakarta Sans', system-ui, sans-serif",
      }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{
            width: 44,
            height: 44,
            border: '3px solid #E5DFD5',
            borderTop: '3px solid #D95D39',
            borderRadius: '50%',
            animation: 'spin 0.8s linear infinite',
            margin: '0 auto 14px',
          }} />
          <div style={{ color: '#57534E', fontSize: 14, fontWeight: 500 }}>Loading MediPulse AI…</div>
        </div>
        <style>{`@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}`}</style>
      </div>
    );
  }

  if (authPhase === 'portal') {
    return <PortalSelector onSelect={handlePortalSelect} />;
  }

  if (authPhase === 'login' && selectedPortal) {
    return (
      <LoginPage
        portal={selectedPortal}
        onBack={handleBackToPortals}
        onSwitchPortal={handlePortalSelect}
        onLoginSuccess={handleLoginSuccess}
      />
    );
  }

  return (
    <WebSocketProvider user={currentUser}>
      <Layout
        activeTab={activeTab}
        onTabChange={setActiveTab}
        currentUser={currentUser}
        onLogout={handleLogout}
      >
        {renderContent()}
      </Layout>
    </WebSocketProvider>
  );
}
