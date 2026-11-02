import React, { useState, useEffect } from 'react';
import {
  Bell,
  Mail,
  Send,
  CheckCircle2
} from 'lucide-react';
import { api } from '../api/client';
import LoadingSkeleton from '../components/LoadingSkeleton';
import EmptyState from '../components/EmptyState';

export default function RestockAlerts() {
  const [medicines, setMedicines] = useState([]);
  const [pharmacies, setPharmacies] = useState([]);
  const [pharmacyId, setPharmacyId] = useState('');
  const [subForm, setSubForm] = useState({
    medicine_id: '',
    patient_email: 'patient@example.com',
    patient_phone: '+91-9876543210'
  });
  const [subSuccess, setSubSuccess] = useState(null);
  const [subscriptions, setSubscriptions] = useState([]);
  const [digestPreview, setDigestPreview] = useState(null);
  const [loadingDigest, setLoadingDigest] = useState(false);
  const [digestSentMsg, setDigestSentMsg] = useState(null);

  const loadData = async () => {
    try {
      const [mList, pList, sList] = await Promise.all([
        api.medicines.list(),
        api.pharmacies.list(),
        api.alerts.subscriptions()
      ]);
      setMedicines(mList);
      setPharmacies(pList);
      setSubscriptions(sList);
      if (mList.length > 0) {
        setSubForm((prev) => ({ ...prev, medicine_id: mList[0].id }));
      }
      if (pList.length > 0) {
        setPharmacyId(pList[0].id);
        fetchDigestPreview(pList[0].id);
      }
    } catch (err) {
      console.warn('Could not load restock alert data:', err);
    }
  };

  const fetchDigestPreview = async (pid) => {
    setLoadingDigest(true);
    setDigestSentMsg(null);
    try {
      const prev = await api.alerts.previewDigest(pid);
      setDigestPreview(prev);
    } catch (err) {
      console.error('Digest preview failed:', err);
    } finally {
      setLoadingDigest(false);
    }
  };

  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSubscribe = async (e) => {
    e.preventDefault();
    try {
      const res = await api.alerts.subscribe(subForm);
      setSubSuccess(res.message);
      const sList = await api.alerts.subscriptions();
      setSubscriptions(sList);
      setTimeout(() => setSubSuccess(null), 4000);
    } catch (err) {
      alert('Subscription failed: ' + err.message);
    }
  };

  const handleSendDigest = async () => {
    if (!pharmacyId) return;
    try {
      await api.alerts.sendDigest(pharmacyId);
      setDigestSentMsg('Daily digest successfully dispatched via notification dispatcher!');
      setTimeout(() => setDigestSentMsg(null), 4000);
    } catch (err) {
      alert('Dispatch failed: ' + err.message);
    }
  };

  return (
    <div>
      {/* Header */}
      <div style={{ marginBottom: 20 }}>
        <h2 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>
          Patient Restock Subscriptions & Pharmacy Daily Digest
        </h2>
        <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 2 }}>
          Automated SMS/Email notification dispatcher for patient availability and daily staff replenishment digests.
        </p>
      </div>

      <div className="grid-cols-2">
        {/* Patient Subscription Card */}
        <div className="card">
          <div className="card-header">
            <span className="card-title">
              <Bell size={18} style={{ color: 'var(--primary)' }} />
              Subscribe to Medicine Restock Notification
            </span>
          </div>

          <form onSubmit={handleSubscribe}>
            <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 16 }}>
              Receive an immediate SMS or Email alert as soon as new batches arrive and are received.
            </p>

            <div style={{ marginBottom: 12 }}>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 500, marginBottom: 4 }}>Medicine to Monitor</label>
              <select
                className="select"
                style={{ width: '100%' }}
                value={subForm.medicine_id}
                onChange={(e) => setSubForm({ ...subForm, medicine_id: e.target.value })}
              >
                {medicines.map((m) => (
                  <option key={m.id} value={m.id}>{m.name} ({m.generic_name})</option>
                ))}
              </select>
            </div>

            <div style={{ marginBottom: 12 }}>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 500, marginBottom: 4 }}>Patient Email</label>
              <input
                type="email"
                className="input"
                style={{ width: '100%' }}
                value={subForm.patient_email}
                onChange={(e) => setSubForm({ ...subForm, patient_email: e.target.value })}
                required
              />
            </div>

            <div style={{ marginBottom: 16 }}>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 500, marginBottom: 4 }}>Mobile Phone Number (SMS)</label>
              <input
                type="text"
                className="input"
                style={{ width: '100%' }}
                value={subForm.patient_phone}
                onChange={(e) => setSubForm({ ...subForm, patient_phone: e.target.value })}
              />
            </div>

            {subSuccess && (
              <div style={{ padding: 10, background: 'var(--low-bg)', color: 'var(--low)', borderRadius: 'var(--radius-sm)', marginBottom: 14, fontSize: 13, display: 'flex', alignItems: 'center', gap: 6 }}>
                <CheckCircle2 size={16} /> {subSuccess}
              </div>
            )}

            <button type="submit" className="btn btn-primary" style={{ width: '100%', justifyContent: 'center' }}>
              <Bell size={15} /> Subscribe to Restock Alert
            </button>
          </form>
        </div>

        {/* Pharmacy Daily Digest Preview */}
        <div className="card">
          <div className="card-header">
            <span className="card-title">
              <Mail size={18} style={{ color: 'var(--accent)' }} />
              Pharmacy Staff Daily Digest Preview
            </span>
            <select
              className="select"
              value={pharmacyId}
              onChange={(e) => { setPharmacyId(e.target.value); fetchDigestPreview(e.target.value); }}
              style={{ fontSize: 12 }}
            >
              {pharmacies.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>

          <div style={{ marginBottom: 14, display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 13 }}>
            <div>
              Target: <b>{digestPreview?.target_email || 'staff@medipulse.ai'}</b>
              <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                {digestPreview?.at_risk_count || 0} at-risk items • {digestPreview?.expiring_count || 0} expiring in 30d
              </div>
            </div>

            <button className="btn btn-primary btn-sm" onClick={handleSendDigest}>
              <Send size={14} /> Send Digest Email
            </button>
          </div>

          {digestSentMsg && (
            <div style={{ padding: 8, background: 'var(--low-bg)', color: 'var(--low)', borderRadius: 4, marginBottom: 10, fontSize: 12 }}>
              ✓ {digestSentMsg}
            </div>
          )}

          {loadingDigest ? (
            <LoadingSkeleton height={180} count={1} />
          ) : digestPreview ? (
            <div
              style={{
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius-sm)',
                maxHeight: 260,
                overflowY: 'auto',
                padding: 10,
                background: '#ffffff'
              }}
              dangerouslySetInnerHTML={{ __html: digestPreview.digest_html_preview }}
            />
          ) : (
            <EmptyState title="No digest preview available" />
          )}
        </div>
      </div>

      {/* Active Subscriptions Table */}
      <div className="card" style={{ marginTop: 20 }}>
        <div className="card-header">
          <span className="card-title">
            Active Patient Restock Subscriptions ({subscriptions.length})
          </span>
        </div>
        <div className="table-responsive">
          <table>
            <thead>
              <tr>
                <th>Medicine</th>
                <th>Patient Email</th>
                <th>Mobile Number</th>
                <th>Notification Status</th>
                <th>Subscribed Timestamp</th>
              </tr>
            </thead>
            <tbody>
              {subscriptions.length === 0 ? (
                <tr>
                  <td colSpan={5} style={{ textAlign: 'center', padding: 24 }}>
                    No active restock subscriptions yet.
                  </td>
                </tr>
              ) : (
                subscriptions.map((s) => (
                  <tr key={s.id}>
                    <td><b>{s.medicines?.name || 'Medicine'}</b></td>
                    <td>{s.patient_email}</td>
                    <td>{s.patient_phone || '—'}</td>
                    <td>
                      <span className={`badge ${s.is_notified ? 'badge-low' : 'badge-medium'}`}>
                        {s.is_notified ? 'Notified & Fulfilled' : 'Monitoring Active'}
                      </span>
                    </td>
                    <td>{new Date(s.created_at).toLocaleString()}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

