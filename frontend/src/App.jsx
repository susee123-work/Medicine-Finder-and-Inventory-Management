import React, { useState } from 'react';
import Layout from './components/Layout';
import DashboardOverview from './pages/DashboardOverview';
import InventoryManager from './pages/InventoryManager';
import ShortagePredictions from './pages/ShortagePredictions';
import OLAPExplorer from './pages/OLAPExplorer';
import DataMiningStudio from './pages/DataMiningStudio';
import PatientFinder from './pages/PatientFinder';
import RestockAlerts from './pages/RestockAlerts';

export default function App() {
  const [activeTab, setActiveTab] = useState('overview');

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

  return (
    <Layout activeTab={activeTab} onTabChange={setActiveTab}>
      {renderContent()}
    </Layout>
  );
}

