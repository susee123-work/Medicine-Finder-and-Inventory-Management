import React, { useState, useEffect } from 'react';
import {
  Search,
  MapPin,
  Clock,
  CheckCircle2,
  Send,
  Navigation,
  Pill
} from 'lucide-react';
import { api, getStoredUser } from '../api/client';
import { useLiveEvents } from '../hooks/useLiveSocket';
import LoadingSkeleton from '../components/LoadingSkeleton';
import EmptyState from '../components/EmptyState';
import Modal from '../components/Modal';

export default function PatientFinder() {
  const storedUser = getStoredUser();
  const [query, setQuery] = useState('Amoxicillin');
  const [openNow, setOpenNow] = useState(false);
  const [inStockOnly, setInStockOnly] = useState(true);
  const [patientCoords, setPatientCoords] = useState({ lat: 13.0418, lng: 80.2341, source: 'default' });
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState([]);
  const [substitutes, setSubstitutes] = useState([]);
  const [selectedResult, setSelectedResult] = useState(null);

  // Confirmation Request Modal (populated dynamically from logged-in user)
  const [confirmModalOpen, setConfirmModalOpen] = useState(false);
  const [confirmTarget, setConfirmTarget] = useState(null);
  const [patientContact, setPatientContact] = useState(storedUser?.email || '');
  const [patientName, setPatientName] = useState(storedUser?.full_name || storedUser?.name || '');
  const [notes, setNotes] = useState('');
  const [confirmSuccess, setConfirmSuccess] = useState(null);
  const [liveStatusAlert, setLiveStatusAlert] = useState(null);

  const handleUseMyLocation = () => {
    if (!navigator.geolocation) {
      alert('Geolocation is not supported by this browser.');
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const nextCoords = { lat: pos.coords.latitude, lng: pos.coords.longitude, source: 'gps' };
        setPatientCoords(nextCoords);
      },
      () => alert('Could not access GPS location — using default coordinates.')
    );
  };

  const doSearch = async (med = query, silent = false) => {
    if (!med.trim()) return;
    if (!silent) setLoading(true);
    if (!silent) setConfirmSuccess(null);
    try {
      const res = await api.finder.search(
        med,
        patientCoords.lat,
        patientCoords.lng,
        openNow,
        inStockOnly
      );
      setResults(res.results || []);
      setSubstitutes(res.generic_substitutes || []);
      if (res.results && res.results.length > 0 && !silent) {
        setSelectedResult(res.results[0]);
      }
    } catch (err) {
      console.error('Search failed:', err);
    } finally {
      if (!silent) setLoading(false);
    }
  };

  useEffect(() => {
    doSearch(query);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openNow, inStockOnly, patientCoords.lat, patientCoords.lng]);

  // Real-time WebSocket updates for stock counts and patient confirmation responses!
  useLiveEvents(['INVENTORY_UPDATED', 'SALE_RECORDED', 'BATCH_VERIFIED', 'DELIVERY_RECEIVED'], () => {
    doSearch(query, true);
  });

  useLiveEvents(['CONFIRMATION_UPDATED'], (event) => {
    if (confirmSuccess && event.payload?.request_id === confirmSuccess.id) {
      setLiveStatusAlert(
        `Live Update: Pharmacy marked your request as ${String(event.payload.status || '').toUpperCase()}${event.payload.notes ? ` — "${event.payload.notes}"` : ''}.`
      );
    }
  });

  const handleSubmitConfirm = async (e) => {
    e.preventDefault();
    if (!confirmTarget) return;
    try {
      const res = await api.finder.confirm({
        pharmacy_id: confirmTarget.pharmacy_id,
        medicine_id: confirmTarget.medicine_id,
        patient_contact: patientContact,
        patient_name: patientName,
        notes: notes
      });
      setConfirmSuccess(res);
      setConfirmModalOpen(false);
    } catch (err) {
      alert('Confirmation submission failed: ' + err.message);
    }
  };

  return (
    <div>
      {/* Header */}
      <div style={{ marginBottom: 20 }}>
        <h2 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>
          Patient Medicine Finder & Stock Verification
        </h2>
        <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 2 }}>
          Find verified stock in nearby pharmacies, check physical verification freshness, and discover generic equivalents.
        </p>
      </div>

      {/* Search Bar & Filters */}
      <div className="card" style={{ marginBottom: 20 }}>
        <form
          onSubmit={(e) => { e.preventDefault(); doSearch(); }}
          style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}
        >
          <div style={{ flex: 1, minWidth: 260, position: 'relative' }}>
            <Search size={18} style={{ position: 'absolute', left: 12, top: 12, color: 'var(--text-muted)' }} />
            <input
              type="text"
              className="input"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search medicine brand name, generic molecule, or dosage..."
              style={{ width: '100%', paddingLeft: 38 }}
            />
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={inStockOnly}
                onChange={(e) => setInStockOnly(e.target.checked)}
              />
              In Stock Only
            </label>

            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={openNow}
                onChange={(e) => setOpenNow(e.target.checked)}
              />
              Open Now
            </label>

            <button type="button" className="btn btn-secondary btn-sm" onClick={handleUseMyLocation}>
              <Navigation size={14} /> {patientCoords.source === 'gps' ? 'Live GPS Active' : 'Use My GPS'}
            </button>

            <button type="submit" className="btn btn-primary">
              <Search size={15} /> Find Medicine
            </button>
          </div>
        </form>
      </div>

      {liveStatusAlert && (
        <div style={{ padding: '12px 16px', background: 'var(--primary-light)', color: 'var(--primary)', borderRadius: 'var(--radius-sm)', marginBottom: 14, fontSize: 13, fontWeight: 600 }}>
          {liveStatusAlert}
        </div>
      )}

      {confirmSuccess && (
        <div style={{ padding: '12px 16px', background: 'var(--low-bg)', color: 'var(--low)', borderRadius: 'var(--radius-sm)', marginBottom: 20, fontSize: 13 }}>
          <CheckCircle2 size={16} style={{ verticalAlign: 'middle', marginRight: 6 }} />
          {confirmSuccess.message} (Request ID: <code>{confirmSuccess.id}</code>)
        </div>
      )}

      {/* Main Grid: Results List + Map / Details Panel */}
      <div className="grid-cols-2" style={{ alignItems: 'flex-start' }}>
        {/* Results List */}
        <div>
          <h3 style={{ fontSize: 15, fontWeight: 600, marginBottom: 12, color: 'var(--text-primary)' }}>
            Nearby In-Stock Pharmacies ({results.length})
          </h3>

          {loading ? (
            <LoadingSkeleton height={110} count={4} />
          ) : results.length === 0 ? (
            <EmptyState
              icon={Pill}
              title={`No pharmacies found with "${query}"`}
              description="Try unchecking 'In Stock Only' or examine the generic equivalents below."
            />
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {results.map((r, idx) => (
                <div
                  key={idx}
                  className="card"
                  onClick={() => setSelectedResult(r)}
                  style={{
                    cursor: 'pointer',
                    borderColor: selectedResult === r ? 'var(--primary)' : 'var(--border)',
                    boxShadow: selectedResult === r ? '0 0 0 2px var(--primary-light)' : 'var(--shadow-sm)'
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div>
                      <h4 style={{ fontSize: 15, fontWeight: 700, margin: 0, color: 'var(--text-primary)' }}>
                        {r.pharmacy}
                      </h4>
                      <div style={{ fontSize: 12, color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: 6, marginTop: 4 }}>
                        <MapPin size={13} style={{ color: 'var(--primary)' }} />
                        <span>{r.address || r.city} {r.distance_km != null ? `(${r.distance_km} km away)` : ''}</span>
                      </div>
                    </div>
                    <div>
                      {r.in_stock ? (
                        <span className="badge badge-low">{r.available_quantity} In Stock</span>
                      ) : (
                        <span className="badge badge-critical">Out of Stock</span>
                      )}
                    </div>
                  </div>

                  <div style={{
                    marginTop: 12,
                    paddingTop: 10,
                    borderTop: '1px solid var(--border-light)',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    fontSize: 12
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--text-muted)' }}>
                      <Clock size={13} />
                      <span>Verified {r.verified_hours_ago} hours ago</span>
                    </div>

                    <button
                      className="btn btn-secondary btn-sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        setConfirmTarget(r);
                        setConfirmModalOpen(true);
                      }}
                    >
                      <Send size={12} /> Confirm Availability
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Generic Substitutes Section */}
          {substitutes.length > 0 && (
            <div className="card" style={{ marginTop: 20, background: 'var(--primary-light)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                <Pill size={18} style={{ color: 'var(--primary)' }} />
                <h4 style={{ fontSize: 14, fontWeight: 700, margin: 0, color: 'var(--text-primary)' }}>
                  Generic & Therapeutic Substitutes
                </h4>
              </div>
              <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 12 }}>
                Equivalent molecules with the exact same therapeutic efficacy. Ask your pharmacist or physician:
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {substitutes.map((sub) => (
                  <div
                    key={sub.medicine_id}
                    style={{
                      background: 'var(--bg-surface)',
                      padding: '10px 14px',
                      borderRadius: 'var(--radius-sm)',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      fontSize: 13
                    }}
                  >
                    <div>
                      <b>{sub.name}</b>
                      <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{sub.reason}</div>
                    </div>
                    <button
                      className="btn btn-secondary btn-sm"
                      onClick={() => { setQuery(sub.name); doSearch(sub.name); }}
                    >
                      Find This
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Selected Pharmacy Details / Map View */}
        <div>
          <div className="card">
            <div className="card-header">
              <span className="card-title">
                <Navigation size={18} style={{ color: 'var(--primary)' }} />
                Location & Pharmacy Verification Freshness
              </span>
            </div>

            {selectedResult ? (
              <div>
                <div style={{
                  height: 240,
                  background: '#0e1f30',
                  borderRadius: 'var(--radius-sm)',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#ffffff',
                  marginBottom: 16,
                  position: 'relative'
                }}>
                  <MapPin size={42} style={{ color: 'var(--primary)', marginBottom: 8 }} />
                  <b style={{ fontSize: 15 }}>{selectedResult.pharmacy}</b>
                  <span style={{ fontSize: 12, color: '#94a3b8' }}>
                    Latitude: {selectedResult.latitude?.toFixed(4)}, Longitude: {selectedResult.longitude?.toFixed(4)}
                  </span>
                  <div style={{ marginTop: 8, padding: '4px 10px', background: 'rgba(255,255,255,0.1)', borderRadius: 20, fontSize: 11 }}>
                    📍 {selectedResult.distance_km ? `${selectedResult.distance_km} km from current location` : 'Location verified'}
                  </div>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 10, fontSize: 13 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: 'var(--text-secondary)' }}>Operating Hours:</span>
                    <b>{selectedResult.is_24_hours ? '24 Hours Open' : '08:00 AM - 11:00 PM'}</b>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: 'var(--text-secondary)' }}>Direct Contact:</span>
                    <b>{selectedResult.phone || '+91-9876543210'}</b>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: 'var(--text-secondary)' }}>Medicine Strength:</span>
                    <b>{selectedResult.strength || 'Standard Dosage'}</b>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: 'var(--text-secondary)' }}>Shelf Verification:</span>
                    <b style={{ color: 'var(--low)' }}>Verified {selectedResult.verified_hours_ago} hours ago</b>
                  </div>
                </div>

                <div style={{ marginTop: 18 }}>
                  <button
                    className="btn btn-primary"
                    style={{ width: '100%', justifyContent: 'center' }}
                    onClick={() => {
                      setConfirmTarget(selectedResult);
                      setConfirmModalOpen(true);
                    }}
                  >
                    Request Reservation Confirmation
                  </button>
                </div>
              </div>
            ) : (
              <EmptyState title="Select a pharmacy to view details" />
            )}
          </div>
        </div>
      </div>

      {/* Confirmation Request Modal */}
      <Modal
        isOpen={confirmModalOpen}
        onClose={() => setConfirmModalOpen(false)}
        title={confirmTarget ? `Confirm Stock with ${confirmTarget.pharmacy}` : 'Confirmation Request'}
      >
        <form onSubmit={handleSubmitConfirm}>
          <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 16 }}>
            Pharmacy staff will immediately receive an alert to physically verify <b>{query}</b> on shelf.
          </p>

          <div style={{ marginBottom: 12 }}>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 500, marginBottom: 4 }}>Your Name</label>
            <input
              type="text"
              className="input"
              style={{ width: '100%' }}
              value={patientName}
              onChange={(e) => setPatientName(e.target.value)}
              required
            />
          </div>

          <div style={{ marginBottom: 12 }}>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 500, marginBottom: 4 }}>
              Mobile Phone or Email (for SMS/Email alert)
            </label>
            <input
              type="text"
              className="input"
              style={{ width: '100%' }}
              value={patientContact}
              onChange={(e) => setPatientContact(e.target.value)}
              required
            />
          </div>

          <div style={{ marginBottom: 16 }}>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 500, marginBottom: 4 }}>Notes / Prescription Details</label>
            <textarea
              className="input"
              rows={3}
              style={{ width: '100%' }}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
            <button type="button" className="btn btn-secondary" onClick={() => setConfirmModalOpen(false)}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary">
              Send Confirmation Request
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

