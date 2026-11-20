import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Plus,
  Upload,
  QrCode,
  CheckCircle2,
  ShoppingCart,
  Check,
  FileText,
  FileSpreadsheet,
  Search,
  Radio
} from 'lucide-react';
import { api, getStoredUser } from '../api/client';
import LoadingSkeleton from '../components/LoadingSkeleton';
import Modal from '../components/Modal';
import BarcodeScannerModal from '../components/BarcodeScannerModal';
import { generateInventoryPDF } from '../utils/inventoryPdf';
import { useLiveEvents, useLiveSocket } from '../hooks/useLiveSocket';
import * as XLSX from 'xlsx';

function defaultFutureDate(daysAhead = 365) {
  return new Date(Date.now() + daysAhead * 86400000).toISOString().slice(0, 10);
}

export default function InventoryManager() {
  const [activeTab, setActiveTab] = useState('inventory'); // 'inventory' or 'deliveries'
  const [loading, setLoading] = useState(true);
  const [batches, setBatches] = useState([]);
  const [deliveries, setDeliveries] = useState([]);
  const [medicines, setMedicines] = useState([]);
  const [pharmacyId, setPharmacyId] = useState('');
  const [pharmacies, setPharmacies] = useState([]);

  // Live filter controls
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [liveSyncNotice, setLiveSyncNotice] = useState(null);

  // Modals
  const [showSaleModal, setShowSaleModal] = useState(false);
  const [showAddBatchModal, setShowAddBatchModal] = useState(false);
  const [showBulkModal, setShowBulkModal] = useState(false);
  const [showBarcodeScanner, setShowBarcodeScanner] = useState(false);
  const [showReceiveModal, setShowReceiveModal] = useState(false);
  const [selectedDelivery, setSelectedDelivery] = useState(null);

  // Form states
  const [saleForm, setSaleForm] = useState({ medicine_id: '', quantity: 1, unit_price: 50.0 });
  const [saleResult, setSaleResult] = useState(null);
  const [batchForm, setBatchForm] = useState({
    medicine_id: '',
    batch_no: '',
    quantity: 50,
    expiry_date: defaultFutureDate(365),
    unit_cost: 35.0,
    selling_price: 50.0
  });
  const [receiveForm, setReceiveForm] = useState({
    quantity_received: 100,
    batch_no: '',
    expiry_date: defaultFutureDate(365)
  });
  const [bulkRows, setBulkRows] = useState([]);
  const [bulkErrors, setBulkErrors] = useState([]);
  const [statusMessage, setStatusMessage] = useState(null);

  const { status: wsStatus } = useLiveSocket();

  const loadData = useCallback(async (pid, silent = false) => {
    if (!silent) setLoading(true);
    try {
      const pharmList = await api.pharmacies.list();
      setPharmacies(pharmList);
      const storedUser = getStoredUser();
      const chosenId = pid || storedUser?.pharmacy_id || pharmList[0]?.id;
      setPharmacyId(chosenId);

      const [invData, delivData, medData] = await Promise.all([
        api.inventory.list(chosenId),
        api.inventory.deliveries(chosenId),
        api.medicines.list()
      ]);
      setBatches(invData);
      setDeliveries(delivData);
      setMedicines(medData);
      if (medData.length > 0 && !silent) {
        const firstPrice = Number(medData[0].default_price || 50);
        setSaleForm((prev) => ({
          ...prev,
          medicine_id: prev.medicine_id || medData[0].id,
          unit_price: firstPrice
        }));
        setBatchForm((prev) => ({
          ...prev,
          medicine_id: prev.medicine_id || medData[0].id,
          selling_price: firstPrice,
          unit_cost: Math.round(firstPrice * 0.7 * 100) / 100
        }));
      }
    } catch (err) {
      console.error('Error loading inventory:', err);
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Real-time WebSocket auto-sync when ANY inventory, sale, or delivery event occurs!
  useLiveEvents(
    ['INVENTORY_UPDATED', 'INVENTORY_BULK_IMPORTED', 'BATCH_VERIFIED', 'SALE_RECORDED', 'DELIVERY_CREATED', 'DELIVERY_RECEIVED'],
    (event) => {
      if (!pharmacyId) return;
      if (event.payload?.pharmacy_id && event.payload.pharmacy_id !== pharmacyId) return;
      loadData(pharmacyId, true);
      setLiveSyncNotice(event.summary || 'Live inventory updated');
      setTimeout(() => setLiveSyncNotice(null), 3500);
    }
  );

  const handlePharmacyChange = (e) => {
    const newId = e.target.value;
    setPharmacyId(newId);
    loadData(newId);
  };

  const handleVerifyBatch = async (batchId) => {
    try {
      const updated = await api.inventory.verify(batchId);
      setBatches((prev) =>
        prev.map((b) => (b.id === batchId ? { ...b, verified_at: updated.verified_at } : b))
      );
      setStatusMessage('Physical stock verified and broadcasted live.');
      setTimeout(() => setStatusMessage(null), 3000);
    } catch (err) {
      alert(err.message);
    }
  };

  const handleExecuteSale = async (e) => {
    e.preventDefault();
    try {
      const res = await api.inventory.recordSale({
        pharmacy_id: pharmacyId,
        medicine_id: saleForm.medicine_id,
        quantity: parseInt(saleForm.quantity, 10),
        unit_price: parseFloat(saleForm.unit_price)
      });
      setSaleResult(res);
      const invData = await api.inventory.list(pharmacyId);
      setBatches(invData);
    } catch (err) {
      alert(`Sale failed: ${err.message}`);
    }
  };

  const handleAddBatch = async (e) => {
    e.preventDefault();
    try {
      await api.inventory.upsert({
        pharmacy_id: pharmacyId,
        medicine_id: batchForm.medicine_id,
        batch_no: batchForm.batch_no,
        quantity: parseInt(batchForm.quantity, 10),
        expiry_date: batchForm.expiry_date,
        unit_cost: parseFloat(batchForm.unit_cost),
        selling_price: parseFloat(batchForm.selling_price)
      });
      setShowAddBatchModal(false);
      const invData = await api.inventory.list(pharmacyId);
      setBatches(invData);
      setStatusMessage('New batch added and synced in real time.');
      setTimeout(() => setStatusMessage(null), 3000);
    } catch (err) {
      alert(err.message);
    }
  };

  const handleReceiveDelivery = async (e) => {
    e.preventDefault();
    if (!selectedDelivery) return;
    try {
      await api.inventory.receiveDelivery(selectedDelivery.id, {
        quantity_received: parseInt(receiveForm.quantity_received, 10),
        batch_no: receiveForm.batch_no,
        expiry_date: receiveForm.expiry_date
      });
      setShowReceiveModal(false);
      const [invData, delivData] = await Promise.all([
        api.inventory.list(pharmacyId),
        api.inventory.deliveries(pharmacyId)
      ]);
      setBatches(invData);
      setDeliveries(delivData);
      setStatusMessage('Delivery confirmed. Inventory batch auto-incremented live.');
      setTimeout(() => setStatusMessage(null), 3000);
    } catch (err) {
      alert(err.message);
    }
  };

  const handleFileUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const bstr = evt.target.result;
        const wb = XLSX.read(bstr, { type: 'binary' });
        const wsname = wb.SheetNames[0];
        const ws = wb.Sheets[wsname];
        const json = XLSX.utils.sheet_to_json(ws);

        const parsed = [];
        const errs = [];
        const fallbackExp = defaultFutureDate(365);
        json.forEach((r, idx) => {
          const medName = r.medicine_name || r.name || r.Medicine;
          const batchNo = r.batch_no || r.batch || r.Batch || `LOT-${idx + 100}`;
          const qty = parseInt(r.quantity || r.qty || 0, 10);
          const exp = r.expiry_date || r.expiry || fallbackExp;

          if (!medName) {
            errs.push(`Row ${idx + 1}: Missing medicine name`);
          } else if (qty < 0) {
            errs.push(`Row ${idx + 1}: Negative quantity`);
          } else {
            parsed.push({
              medicine_name: String(medName),
              batch_no: String(batchNo),
              quantity: qty,
              expiry_date: String(exp),
              unit_cost: parseFloat(r.unit_cost || 30.0),
              selling_price: parseFloat(r.selling_price || 50.0)
            });
          }
        });

        setBulkRows(parsed);
        setBulkErrors(errs);
      } catch (err) {
        alert('Failed to parse file: ' + err.message);
      }
    };
    reader.readAsBinaryString(file);
  };

  const handleCommitBulkUpload = async () => {
    if (bulkRows.length === 0) return;
    try {
      const res = await api.inventory.bulkUpload({
        pharmacy_id: pharmacyId,
        items: bulkRows
      });
      setShowBulkModal(false);
      setBulkRows([]);
      const invData = await api.inventory.list(pharmacyId);
      setBatches(invData);
      setStatusMessage(`Bulk upload finished: ${res.rows_processed} batches imported live.`);
      setTimeout(() => setStatusMessage(null), 3000);
    } catch (err) {
      alert('Bulk upload failed: ' + err.message);
    }
  };

  const todayStr = new Date().toISOString().slice(0, 10);
  const thirtyDaysStr = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);

  const selectedPharmacy = useMemo(
    () => pharmacies.find((p) => p.id === pharmacyId) || null,
    [pharmacies, pharmacyId]
  );

  // Live computed summary metrics
  const summaryStats = useMemo(() => {
    const totalUnits = batches.reduce((s, b) => s + Number(b.quantity || 0), 0);
    const totalValue = batches.reduce(
      (s, b) => s + Number(b.quantity || 0) * Number(b.unit_cost || b.selling_price || 0),
      0
    );
    const expired = batches.filter((b) => b.expiry_date && b.expiry_date < todayStr).length;
    const nearExpiry = batches.filter(
      (b) => b.expiry_date && b.expiry_date >= todayStr && b.expiry_date <= thirtyDaysStr && Number(b.quantity || 0) > 0
    ).length;
    const critical = batches.filter((b) => Number(b.quantity || 0) > 0 && Number(b.quantity || 0) < 10).length;
    return { totalUnits, totalValue, expired, nearExpiry, critical };
  }, [batches, todayStr, thirtyDaysStr]);

  // Filtered batches for table + PDF export
  const filteredBatches = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    return batches.filter((b) => {
      const med = b.medicines || {};
      const isExp = b.expiry_date < todayStr;
      const isNearExp = !isExp && b.expiry_date <= thirtyDaysStr;
      const isCritical = b.quantity > 0 && b.quantity < 10;
      const isDepleted = b.quantity === 0;

      if (statusFilter === 'EXPIRED' && !isExp) return false;
      if (statusFilter === 'NEAR_EXPIRY' && !isNearExp) return false;
      if (statusFilter === 'CRITICAL' && !isCritical) return false;
      if (statusFilter === 'DEPLETED' && !isDepleted) return false;
      if (statusFilter === 'GOOD' && (isExp || isNearExp || isDepleted)) return false;

      if (!q) return true;
      return (
        (med.name || '').toLowerCase().includes(q) ||
        (med.generic_name || '').toLowerCase().includes(q) ||
        (med.therapeutic_category || '').toLowerCase().includes(q) ||
        (b.batch_no || '').toLowerCase().includes(q)
      );
    });
  }, [batches, searchTerm, statusFilter, todayStr, thirtyDaysStr]);

  // Export Executive PDF Inventory Report
  const handleExportPDF = () => {
    const storedUser = getStoredUser();
    generateInventoryPDF({
      pharmacy: selectedPharmacy,
      batches: filteredBatches,
      deliveries,
      generatedBy: storedUser?.full_name || storedUser?.name || 'MediPulse Staff',
    });
    setStatusMessage(`Exported PDF report (${filteredBatches.length} batches).`);
    setTimeout(() => setStatusMessage(null), 3000);
  };

  // Export Excel Inventory Workbook
  const handleExportExcel = () => {
    const exportRows = filteredBatches.map((b) => ({
      Medicine: b.medicines?.name || 'Medicine',
      Generic: b.medicines?.generic_name || '',
      Category: b.medicines?.therapeutic_category || 'General',
      Batch_No: b.batch_no,
      Quantity: b.quantity,
      Unit_Cost: b.unit_cost || 0,
      Selling_Price: b.selling_price || 0,
      Expiry_Date: b.expiry_date,
      Verified_At: b.verified_at || 'Unverified',
    }));
    const ws = XLSX.utils.json_to_sheet(exportRows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'FEFO_Inventory');
    const safeName = (selectedPharmacy?.name || 'Inventory').replace(/[^A-Za-z0-9]+/g, '_');
    XLSX.writeFile(wb, `MediPulse_Inventory_${safeName}_${todayStr}.xlsx`);
  };

  return (
    <div>
      {/* Header & Controls */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <h2 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>
              Pharmacy Inventory &amp; FEFO Stock Management
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
              {wsStatus === 'connected' ? 'Live Sync Active' : 'Connecting…'}
            </span>
          </div>
          <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 2 }}>
            Real-time First-Expired, First-Out batch tracking, PDF audit reporting, and live WebSocket updates.
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <select className="select" value={pharmacyId} onChange={handlePharmacyChange} style={{ fontWeight: 600 }}>
            {pharmacies.map((p) => (
              <option key={p.id} value={p.id}>{p.name} ({p.city})</option>
            ))}
          </select>

          <button className="btn btn-secondary btn-sm" onClick={handleExportPDF} disabled={loading}>
            <FileText size={14} /> Export PDF Report
          </button>
          <button className="btn btn-secondary btn-sm" onClick={handleExportExcel} disabled={loading}>
            <FileSpreadsheet size={14} /> Excel
          </button>
          <button className="btn btn-secondary btn-sm" onClick={() => setShowBarcodeScanner(true)}>
            <QrCode size={14} /> Scan Barcode
          </button>
          <button className="btn btn-secondary btn-sm" onClick={() => setShowBulkModal(true)}>
            <Upload size={14} /> Bulk CSV/Excel
          </button>
          <button className="btn btn-secondary btn-sm" onClick={() => setShowAddBatchModal(true)}>
            <Plus size={14} /> Add Batch
          </button>
          <button className="btn btn-primary btn-sm" onClick={() => { setSaleResult(null); setShowSaleModal(true); }}>
            <ShoppingCart size={14} /> New FEFO Sale
          </button>
        </div>
      </div>

      {/* Live Dynamic KPI Summary Strip */}
      <div className="grid-cols-4" style={{ marginBottom: 16 }}>
        <div className="card" style={{ padding: '14px 16px', marginBottom: 0 }}>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>Active Batches / Units</div>
          <div style={{ fontSize: 22, fontWeight: 700, marginTop: 4 }}>
            {batches.length} <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-secondary)' }}>({summaryStats.totalUnits.toLocaleString('en-IN')} units)</span>
          </div>
        </div>
        <div className="card" style={{ padding: '14px 16px', marginBottom: 0 }}>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>Live Inventory Valuation</div>
          <div style={{ fontSize: 22, fontWeight: 700, marginTop: 4, color: 'var(--primary)' }}>
            ₹{Math.round(summaryStats.totalValue).toLocaleString('en-IN')}
          </div>
        </div>
        <div className="card" style={{ padding: '14px 16px', marginBottom: 0 }}>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>Expiring &lt;30d / Expired</div>
          <div style={{ fontSize: 22, fontWeight: 700, marginTop: 4, color: summaryStats.expired > 0 ? 'var(--critical)' : 'var(--high)' }}>
            {summaryStats.nearExpiry} <span style={{ fontSize: 14, color: 'var(--critical)' }}>/ {summaryStats.expired}</span>
          </div>
        </div>
        <div className="card" style={{ padding: '14px 16px', marginBottom: 0 }}>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>Critical Stock (&lt;10 Units)</div>
          <div style={{ fontSize: 22, fontWeight: 700, marginTop: 4, color: summaryStats.critical > 0 ? 'var(--critical)' : 'var(--low)' }}>
            {summaryStats.critical}
          </div>
        </div>
      </div>

      {liveSyncNotice && (
        <div style={{ padding: '9px 14px', background: 'var(--primary-light)', color: 'var(--primary)', borderRadius: 'var(--radius-sm)', marginBottom: 12, fontSize: 13, display: 'flex', alignItems: 'center', gap: 8, fontWeight: 600 }}>
          <Radio size={15} /> Live WebSocket Sync: {liveSyncNotice}
        </div>
      )}

      {statusMessage && (
        <div style={{ padding: '10px 16px', background: 'var(--low-bg)', color: 'var(--low)', borderRadius: 'var(--radius-sm)', marginBottom: 16, fontSize: 13, display: 'flex', alignItems: 'center', gap: 8 }}>
          <CheckCircle2 size={16} /> {statusMessage}
        </div>
      )}

      {/* Tabs + Search/Filter */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12, borderBottom: '1px solid var(--border)', marginBottom: 16, paddingBottom: 8 }}>
        <div style={{ display: 'flex', gap: 12 }}>
          <button
            onClick={() => setActiveTab('inventory')}
            style={{
              padding: '8px 16px',
              border: 'none',
              borderBottom: activeTab === 'inventory' ? '2px solid var(--primary)' : '2px solid transparent',
              background: 'transparent',
              color: activeTab === 'inventory' ? 'var(--primary)' : 'var(--text-secondary)',
              fontWeight: 600,
              cursor: 'pointer'
            }}
          >
            Active Batches ({filteredBatches.length})
          </button>
          <button
            onClick={() => setActiveTab('deliveries')}
            style={{
              padding: '8px 16px',
              border: 'none',
              borderBottom: activeTab === 'deliveries' ? '2px solid var(--primary)' : '2px solid transparent',
              background: 'transparent',
              color: activeTab === 'deliveries' ? 'var(--primary)' : 'var(--text-secondary)',
              fontWeight: 600,
              cursor: 'pointer'
            }}
          >
            Purchase Orders &amp; Deliveries ({deliveries.length})
          </button>
        </div>

        {activeTab === 'inventory' && (
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <div style={{ position: 'relative' }}>
              <Search size={14} style={{ position: 'absolute', left: 10, top: 10, color: 'var(--text-muted)' }} />
              <input
                type="text"
                className="input"
                placeholder="Filter medicine, batch, category…"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                style={{ paddingLeft: 30, fontSize: 13, width: 220 }}
              />
            </div>
            <select
              className="select"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              style={{ fontSize: 13 }}
            >
              <option value="ALL">All Statuses</option>
              <option value="GOOD">Good Stock</option>
              <option value="CRITICAL">Critical (&lt;10)</option>
              <option value="NEAR_EXPIRY">Expiring (&lt;30d)</option>
              <option value="EXPIRED">Expired</option>
              <option value="DEPLETED">Depleted (0)</option>
            </select>
          </div>
        )}
      </div>

      {loading ? (
        <LoadingSkeleton height={48} count={8} />
      ) : activeTab === 'inventory' ? (
        /* Inventory Table */
        <div className="card">
          <div className="table-responsive">
            <table>
              <thead>
                <tr>
                  <th>Medicine Name</th>
                  <th>Therapeutic Class</th>
                  <th>Batch Number</th>
                  <th>Stock On Hand</th>
                  <th>Expiry Date</th>
                  <th>Status</th>
                  <th>Last Verified</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredBatches.length === 0 ? (
                  <tr>
                    <td colSpan={8} style={{ textAlign: 'center', padding: 32 }}>
                      No inventory batches match your current filter.
                    </td>
                  </tr>
                ) : (
                  filteredBatches.map((b) => {
                    const med = b.medicines || {};
                    const isExp = b.expiry_date < todayStr;
                    const isNearExp = !isExp && b.expiry_date <= thirtyDaysStr;

                    return (
                      <tr key={b.id} style={{ opacity: b.quantity === 0 ? 0.6 : 1 }}>
                        <td>
                          <b>{med.name || 'Medicine'}</b>
                          <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{med.generic_name}</div>
                        </td>
                        <td>{med.therapeutic_category || 'General'}</td>
                        <td><code>{b.batch_no}</code></td>
                        <td>
                          <span style={{ fontSize: 15, fontWeight: 700, color: b.quantity < 10 ? 'var(--critical)' : 'inherit' }}>
                            {b.quantity}
                          </span> units
                        </td>
                        <td>{b.expiry_date}</td>
                        <td>
                          {isExp ? (
                            <span className="badge badge-critical">Expired</span>
                          ) : isNearExp ? (
                            <span className="badge badge-high">&lt; 30d Expiry</span>
                          ) : b.quantity === 0 ? (
                            <span className="badge badge-medium">Depleted</span>
                          ) : b.quantity < 10 ? (
                            <span className="badge badge-critical">Critical Low</span>
                          ) : (
                            <span className="badge badge-low">Good Stock</span>
                          )}
                        </td>
                        <td>
                          <div style={{ fontSize: 12 }}>
                            {b.verified_at ? new Date(b.verified_at).toLocaleString() : 'Unverified'}
                          </div>
                        </td>
                        <td>
                          <button
                            className="btn btn-secondary btn-sm"
                            title="Verify physical shelf count"
                            onClick={() => handleVerifyBatch(b.id)}
                          >
                            <Check size={12} /> Verify
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        /* Deliveries Tab */
        <div className="card">
          <div className="table-responsive">
            <table>
              <thead>
                <tr>
                  <th>Medicine</th>
                  <th>Supplier / Distributor</th>
                  <th>Ordered On</th>
                  <th>Expected On</th>
                  <th>Qty Ordered</th>
                  <th>Status</th>
                  <th>Lead Time / Delay</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {deliveries.length === 0 ? (
                  <tr>
                    <td colSpan={8} style={{ textAlign: 'center', padding: 32 }}>
                      No purchase orders recorded.
                    </td>
                  </tr>
                ) : (
                  deliveries.map((d) => (
                    <tr key={d.id}>
                      <td><b>{d.medicines?.name || 'Medicine'}</b></td>
                      <td>{d.suppliers?.name || 'Distributor'}</td>
                      <td>{d.ordered_on}</td>
                      <td>{d.expected_on}</td>
                      <td>{d.quantity_ordered} units</td>
                      <td>
                        <span className={`badge ${d.status === 'DELIVERED' ? 'badge-low' : 'badge-high'}`}>
                          {d.status}
                        </span>
                      </td>
                      <td>
                        {d.lead_time_days ? `${d.lead_time_days} days` : 'Pending'}
                        {d.delay_days > 0 && (
                          <span style={{ color: 'var(--critical)', marginLeft: 6, fontSize: 11 }}>
                            (+{d.delay_days}d late)
                          </span>
                        )}
                      </td>
                      <td>
                        {d.status !== 'DELIVERED' ? (
                          <button
                            className="btn btn-primary btn-sm"
                            onClick={() => {
                              setSelectedDelivery(d);
                              setReceiveForm({
                                quantity_received: d.quantity_ordered,
                                batch_no: `BATCH-${d.medicines?.name?.slice(0, 3).toUpperCase()}-${Math.floor(100 + Math.random() * 900)}`,
                                expiry_date: defaultFutureDate(365)
                              });
                              setShowReceiveModal(true);
                            }}
                          >
                            Receive Order
                          </button>
                        ) : (
                          <span style={{ fontSize: 12, color: 'var(--low)' }}>Received</span>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* MODAL: New FEFO Sale */}
      <Modal isOpen={showSaleModal} onClose={() => setShowSaleModal(false)} title="Record Sale with FEFO Allocation">
        <form onSubmit={handleExecuteSale}>
          <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 16 }}>
            Dispensing automatically consumes batches with the <b>earliest expiration date</b> first (FEFO principle) and broadcasts live over WebSocket.
          </p>

          <div style={{ marginBottom: 12 }}>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 500, marginBottom: 4 }}>Medicine</label>
            <select
              className="select"
              style={{ width: '100%' }}
              value={saleForm.medicine_id}
              onChange={(e) => {
                const chosen = medicines.find((m) => m.id === e.target.value);
                setSaleForm({
                  ...saleForm,
                  medicine_id: e.target.value,
                  unit_price: Number(chosen?.default_price || saleForm.unit_price)
                });
              }}
            >
              {medicines.map((m) => (
                <option key={m.id} value={m.id}>{m.name} ({m.generic_name}) — ₹{m.default_price}</option>
              ))}
            </select>
          </div>

          <div style={{ display: 'flex', gap: 12, marginBottom: 16 }}>
            <div style={{ flex: 1 }}>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 500, marginBottom: 4 }}>Quantity (Units)</label>
              <input
                type="number"
                min="1"
                className="input"
                style={{ width: '100%' }}
                value={saleForm.quantity}
                onChange={(e) => setSaleForm({ ...saleForm, quantity: e.target.value })}
                required
              />
            </div>
            <div style={{ flex: 1 }}>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 500, marginBottom: 4 }}>Unit Price (₹)</label>
              <input
                type="number"
                step="0.5"
                className="input"
                style={{ width: '100%' }}
                value={saleForm.unit_price}
                onChange={(e) => setSaleForm({ ...saleForm, unit_price: e.target.value })}
                required
              />
            </div>
          </div>

          {saleResult && (
            <div style={{ padding: 12, background: 'var(--low-bg)', borderRadius: 'var(--radius-sm)', marginBottom: 16, fontSize: 13 }}>
              <div style={{ fontWeight: 600, color: 'var(--low)', marginBottom: 6 }}>
                ✓ Sale Executed! FEFO Batch Deductions:
              </div>
              {saleResult.fefo_deductions.map((d, i) => (
                <div key={i} style={{ color: 'var(--text-primary)' }}>
                  • Deducted <b>{d.deducted} units</b> from Batch <code>{d.batch_no}</code> ({d.remaining} left)
                </div>
              ))}
            </div>
          )}

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
            <button type="button" className="btn btn-secondary" onClick={() => setShowSaleModal(false)}>
              Close
            </button>
            <button type="submit" className="btn btn-primary">
              Confirm FEFO Sale
            </button>
          </div>
        </form>
      </Modal>

      {/* MODAL: Add Batch */}
      <Modal isOpen={showAddBatchModal} onClose={() => setShowAddBatchModal(false)} title="Add Inventory Batch">
        <form onSubmit={handleAddBatch}>
          <div style={{ marginBottom: 12 }}>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 500, marginBottom: 4 }}>Medicine</label>
            <select
              className="select"
              style={{ width: '100%' }}
              value={batchForm.medicine_id}
              onChange={(e) => {
                const chosen = medicines.find((m) => m.id === e.target.value);
                const price = Number(chosen?.default_price || 50);
                setBatchForm({
                  ...batchForm,
                  medicine_id: e.target.value,
                  selling_price: price,
                  unit_cost: Math.round(price * 0.7 * 100) / 100
                });
              }}
            >
              {medicines.map((m) => (
                <option key={m.id} value={m.id}>{m.name}</option>
              ))}
            </select>
          </div>
          <div style={{ display: 'flex', gap: 12, marginBottom: 12 }}>
            <div style={{ flex: 1 }}>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 500, marginBottom: 4 }}>Batch / Lot Number</label>
              <input
                type="text"
                className="input"
                style={{ width: '100%' }}
                value={batchForm.batch_no}
                onChange={(e) => setBatchForm({ ...batchForm, batch_no: e.target.value })}
                placeholder="e.g. BATCH-AMO-202"
                required
              />
            </div>
            <div style={{ flex: 1 }}>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 500, marginBottom: 4 }}>Quantity</label>
              <input
                type="number"
                min="0"
                className="input"
                style={{ width: '100%' }}
                value={batchForm.quantity}
                onChange={(e) => setBatchForm({ ...batchForm, quantity: e.target.value })}
                required
              />
            </div>
          </div>
          <div style={{ marginBottom: 16 }}>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 500, marginBottom: 4 }}>Expiry Date</label>
            <input
              type="date"
              className="input"
              style={{ width: '100%' }}
              value={batchForm.expiry_date}
              onChange={(e) => setBatchForm({ ...batchForm, expiry_date: e.target.value })}
              required
            />
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
            <button type="button" className="btn btn-secondary" onClick={() => setShowAddBatchModal(false)}>Cancel</button>
            <button type="submit" className="btn btn-primary">Save Batch</button>
          </div>
        </form>
      </Modal>

      {/* MODAL: Bulk CSV / Excel Upload */}
      <Modal isOpen={showBulkModal} onClose={() => setShowBulkModal(false)} title="Bulk Stock CSV / Excel Import" maxWidth={700}>
        <div>
          <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 12 }}>
            Upload a spreadsheet with columns: <code>medicine_name</code>, <code>batch_no</code>, <code>quantity</code>, <code>expiry_date</code>.
          </p>
          <input
            type="file"
            accept=".csv, .xlsx, .xls"
            onChange={handleFileUpload}
            style={{ marginBottom: 16, display: 'block' }}
          />

          {bulkErrors.length > 0 && (
            <div style={{ padding: 10, background: 'var(--critical-bg)', color: 'var(--critical)', borderRadius: 'var(--radius-sm)', marginBottom: 12, fontSize: 12 }}>
              <b>Row Validation Warnings:</b>
              {bulkErrors.slice(0, 3).map((e, idx) => <div key={idx}>• {e}</div>)}
            </div>
          )}

          {bulkRows.length > 0 && (
            <div>
              <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 6 }}>
                Preview Parsed Rows ({bulkRows.length} valid items):
              </div>
              <div className="table-responsive" style={{ maxHeight: 200, overflowY: 'auto', marginBottom: 16 }}>
                <table>
                  <thead>
                    <tr>
                      <th>Medicine</th>
                      <th>Batch</th>
                      <th>Qty</th>
                      <th>Expiry</th>
                    </tr>
                  </thead>
                  <tbody>
                    {bulkRows.slice(0, 8).map((r, i) => (
                      <tr key={i}>
                        <td>{r.medicine_name}</td>
                        <td>{r.batch_no}</td>
                        <td>{r.quantity}</td>
                        <td>{r.expiry_date}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
            <button type="button" className="btn btn-secondary" onClick={() => setShowBulkModal(false)}>Cancel</button>
            <button
              type="button"
              className="btn btn-primary"
              disabled={bulkRows.length === 0}
              onClick={handleCommitBulkUpload}
            >
              Import {bulkRows.length} Batches
            </button>
          </div>
        </div>
      </Modal>

      {/* MODAL: Receive Delivery */}
      <Modal isOpen={showReceiveModal} onClose={() => setShowReceiveModal(false)} title="Confirm Delivery Receipt">
        <form onSubmit={handleReceiveDelivery}>
          <div style={{ marginBottom: 12, fontSize: 13 }}>
            Receiving purchase order for <b>{selectedDelivery?.medicines?.name}</b> from <b>{selectedDelivery?.suppliers?.name}</b>.
          </div>
          <div style={{ marginBottom: 12 }}>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 500, marginBottom: 4 }}>Quantity Received</label>
            <input
              type="number"
              min="1"
              className="input"
              style={{ width: '100%' }}
              value={receiveForm.quantity_received}
              onChange={(e) => setReceiveForm({ ...receiveForm, quantity_received: e.target.value })}
              required
            />
          </div>
          <div style={{ marginBottom: 12 }}>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 500, marginBottom: 4 }}>Batch / Lot Number</label>
            <input
              type="text"
              className="input"
              style={{ width: '100%' }}
              value={receiveForm.batch_no}
              onChange={(e) => setReceiveForm({ ...receiveForm, batch_no: e.target.value })}
              required
            />
          </div>
          <div style={{ marginBottom: 16 }}>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 500, marginBottom: 4 }}>Expiry Date</label>
            <input
              type="date"
              className="input"
              style={{ width: '100%' }}
              value={receiveForm.expiry_date}
              onChange={(e) => setReceiveForm({ ...receiveForm, expiry_date: e.target.value })}
              required
            />
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
            <button type="button" className="btn btn-secondary" onClick={() => setShowReceiveModal(false)}>Cancel</button>
            <button type="submit" className="btn btn-primary">Add Received Stock</button>
          </div>
        </form>
      </Modal>

      {/* Live Dynamic Barcode Scanner Modal */}
      <BarcodeScannerModal
        isOpen={showBarcodeScanner}
        onClose={() => setShowBarcodeScanner(false)}
        medicines={medicines}
        onScanComplete={(item) => {
          setBatchForm({
            ...batchForm,
            medicine_id: item.medicine_id || batchForm.medicine_id,
            batch_no: item.code,
            quantity: item.qty || 50,
            expiry_date: item.exp || defaultFutureDate(365),
            selling_price: item.price || batchForm.selling_price,
            unit_cost: Math.round((item.price || 50) * 0.7 * 100) / 100,
          });
          setShowAddBatchModal(true);
        }}
      />
    </div>
  );
}
