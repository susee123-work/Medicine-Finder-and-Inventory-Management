import React, { useState, useEffect } from 'react';
import {
  Bell,
  Mail,
  Send,
  CheckCircle2,
  AlertCircle,
  Server
} from 'lucide-react';
import { api, getStoredUser } from '../api/client';
import { useLiveEvents } from '../hooks/useLiveSocket';
import LoadingSkeleton from '../components/LoadingSkeleton';
import EmptyState from '../components/EmptyState';

export default function RestockAlerts() {
  const storedUser = getStoredUser();
  const [medicines, setMedicines] = useState([]);
  const [pharmacies, setPharmacies] = useState([]);
  const [pharmacyId, setPharmacyId] = useState('');
  const [subForm, setSubForm] = useState({
    medicine_id: '',
    patient_email: storedUser?.email || '',
    patient_phone: ''
  });
  const [subSuccess, setSubSuccess] = useState(null);
  const [subscriptions, setSubscriptions] = useState([]);
  const [digestPreview, setDigestPreview] = useState(null);
  const [digestTargetOverride, setDigestTargetOverride] = useState('');
  const [loadingDigest, setLoadingDigest] = useState(false);
  const [digestSentMsg, setDigestSentMsg] = useState(null);
  const [smtpStatus, setSmtpStatus] = useState(null);
  const [testEmailTo, setTestEmailTo] = useState('');
  const [testEmailResult, setTestEmailResult] = useState(null);
  const [sendingTest, setSendingTest] = useState(false);

  const loadData = async () => {
    try {
      const [mList, pList, sList, emailSt] = await Promise.all([
        api.medicines.list(),
        api.pharmacies.list(),
        api.alerts.subscriptions(),
        api.email.status().catch(() => null)
      ]);
      setMedicines(mList);
      setPharmacies(pList);
      setSubscriptions(sList);
      if (emailSt) {
        setSmtpStatus(emailSt);
        if (emailSt.username) setTestEmailTo(emailSt.username);
      }
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

  // Live WebSocket auto-refresh for subscriptions, restock notifications & digests
  useLiveEvents(['SUBSCRIPTION_CREATED', 'DELIVERY_RECEIVED', 'INVENTORY_UPDATED', 'DIGEST_DISPATCHED'], () => {
    api.alerts.subscriptions().then(setSubscriptions).catch(() => {});
    if (pharmacyId) fetchDigestPreview(pharmacyId);
  });

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
      const res = await api.alerts.sendDigest(pharmacyId, digestTargetOverride);
      if (res.result && res.result.success === false) {
        setDigestSentMsg({ ok: false, text: `SMTP error: ${res.result.error}` });
      } else {
        setDigestSentMsg({
          ok: true,
          text: `Daily digest sent to ${res.recipient || digestPreview?.target_email} via ${res.result?.provider || 'SMTP'}!`
        });
      }
      setTimeout(() => setDigestSentMsg(null), 6000);
    } catch (err) {
      alert('Dispatch failed: ' + err.message);
    }
  };

  const handleSendTestEmail = async (e) => {
    e.preventDefault();
    if (!testEmailTo.trim()) return;
    setSendingTest(true);
    setTestEmailResult(null);
    try {
      const res = await api.email.test(testEmailTo.trim());
      setTestEmailResult(res);
      const updatedSt = await api.email.status().catch(() => null);
      if (updatedSt) setSmtpStatus(updatedSt);
    } catch (err) {
      setTestEmailResult({ success: false, error: err.message });
    } finally {
      setSendingTest(false);
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
          Automated Gmail SMTP Email & SMS notification dispatcher for patient availability and daily staff replenishment digests.
        </p>
      </div>

      {/* Gmail SMTP Status & Test Bar */}
      <div className="card" style={{ marginBottom: 20 }}>
        <div className="card-header">
          <span className="card-title">
            <Server size={18} style={{ color: 'var(--primary)' }} />
            Gmail SMTP Email Gateway
          </span>
          <span className={`badge ${smtpStatus?.configured && !smtpStatus?.mock_mode ? 'badge-low' : 'badge-medium'}`}>
            {smtpStatus?.configured && !smtpStatus?.mock_mode
              ? `Live SMTP (${smtpStatus.host}:${smtpStatus.port})`
              : 'Stub / Check SMTP_USERNAME in backend/.env'}
          </span>
        </div>

        <form onSubmit={handleSendTestEmail} style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center' }}>
          <div style={{ fontSize: 13, color: 'var(--text-secondary)', flex: '1 1 220px' }}>
            Sender: <b>{smtpStatus?.username || 'Not configured'}</b>
          </div>
          <input
            type="email"
            className="input"
            placeholder="Recipient email to test SMTP…"
            value={testEmailTo}
            onChange={(e) => setTestEmailTo(e.target.value)}
            style={{ flex: '1 1 240px' }}
            required
          />
          <button type="submit" className="btn btn-primary btn-sm" disabled={sendingTest}>
            <Send size={14} /> {sendingTest ? 'Sending…' : 'Send Test Email'}
          </button>
        </form>

        {testEmailResult && (
          <div style={{
            marginTop: 10,
            padding: '8px 12px',
            borderRadius: 'var(--radius-sm)',
            fontSize: 13,
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            background: testEmailResult.success ? 'var(--low-bg)' : 'var(--critical-bg)',
            color: testEmailResult.success ? 'var(--low)' : 'var(--critical)',
          }}>
            {testEmailResult.success ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
            <span>
              {testEmailResult.success
                ? `Test email delivered via ${testEmailResult.provider} to ${testEmailResult.to || testEmailTo}`
                : `Failed: ${testEmailResult.error}`}
            </span>
          </div>
        )}
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
              Receive an immediate SMTP Email or SMS alert as soon as new batches arrive and are received.
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

          <div style={{ marginBottom: 10, display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', justifyContent: 'space-between', fontSize: 13 }}>
            <div>
              Default Target: <b>{digestPreview?.target_email || 'staff@medipulse.ai'}</b>
              <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                {digestPreview?.at_risk_count || 0} at-risk items • {digestPreview?.expiring_count || 0} expiring in 30d
              </div>
            </div>

            <button className="btn btn-primary btn-sm" onClick={handleSendDigest}>
              <Send size={14} /> Send Digest Email
            </button>
          </div>

          <div style={{ marginBottom: 12 }}>
            <input
              type="email"
              className="input"
              style={{ width: '100%', fontSize: 12 }}
              placeholder="Optional: override recipient email (e.g. your Gmail)…"
              value={digestTargetOverride}
              onChange={(e) => setDigestTargetOverride(e.target.value)}
            />
          </div>

          {digestSentMsg && (
            <div style={{
              padding: 8,
              background: digestSentMsg.ok ? 'var(--low-bg)' : 'var(--critical-bg)',
              color: digestSentMsg.ok ? 'var(--low)' : 'var(--critical)',
              borderRadius: 4,
              marginBottom: 10,
              fontSize: 12
            }}>
              {digestSentMsg.ok ? '✓ ' : '✗ '}{digestSentMsg.text}
            </div>
          )}

          {loadingDigest ? (
            <LoadingSkeleton height={180} count={1} />
          ) : digestPreview ? (
            <div
              style={{
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius-sm)',
                maxHeight: 240,
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
