import React, { useState, useEffect, useCallback } from 'react';
import {
  Search,
  MapPin,
  Clock,
  CheckCircle2,
  Send,
  Navigation,
  Pill,
  ShieldCheck,
  AlertCircle,
  ShoppingBag,
  RefreshCw,
  Building2,
  Check,
  X
} from 'lucide-react';
import { api, getStoredUser } from '../api/client';
import { useLiveEvents } from '../hooks/useLiveSocket';
import LoadingSkeleton from '../components/LoadingSkeleton';
import EmptyState from '../components/EmptyState';
import Modal from '../components/Modal';

export default function PatientFinder() {
  const storedUser = getStoredUser();

  // Navigation tab
  const [activeTab, setActiveTab] = useState('finder'); // 'finder' | 'my_requests' | 'pharmacy_desk'

  // Search & Filter state
  const [query, setQuery] = useState('Amoxicillin');
  const [cityFilter, setCityFilter] = useState('all');
  const [openNow, setOpenNow] = useState(false);
  const [inStockOnly, setInStockOnly] = useState(true);
  const [patientCoords, setPatientCoords] = useState({ lat: 13.0418, lng: 80.2341, source: 'default' });

  // Live master data
  const [medicinesList, setMedicinesList] = useState([]);
  const [pharmaciesList, setPharmaciesList] = useState([]);
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState([]);
  const [substitutes, setSubstitutes] = useState([]);
  const [selectedResult, setSelectedResult] = useState(null);

  // Patient's Placed Requests (dynamic live tracking)
  const [myRequests, setMyRequests] = useState([]);
  const [loadingRequests, setLoadingRequests] = useState(false);
  const [incomingDeskRequests, setIncomingDeskRequests] = useState([]);
  const [loadingDesk, setLoadingDesk] = useState(false);

  // Medicine Placement / Reservation Modal state
  const [confirmModalOpen, setConfirmModalOpen] = useState(false);
  const [confirmTarget, setConfirmTarget] = useState(null);
  const [patientContact, setPatientContact] = useState(storedUser?.email || '');
  const [patientName, setPatientName] = useState(storedUser?.full_name || storedUser?.name || 'Patient');
  const [quantityRequested, setQuantityRequested] = useState(1);
  const [urgency, setUrgency] = useState('Normal');
  const [pickupPreference, setPickupPreference] = useState('Counter Pickup');
  const [notes, setNotes] = useState('');
  const [submittingConfirm, setSubmittingConfirm] = useState(false);
  const [confirmSuccess, setConfirmSuccess] = useState(null);
  const [liveStatusAlert, setLiveStatusAlert] = useState(null);

  const [respondingId, setRespondingId] = useState(null);

  // Load initial medicines and pharmacies master list
  useEffect(() => {
    Promise.all([
      api.medicines.list().catch(() => []),
      api.pharmacies.list().catch(() => [])
    ]).then(([meds, pharms]) => {
      setMedicinesList(meds || []);
      setPharmaciesList(pharms || []);
    });
  }, []);

  // Fetch patient requests
  const fetchMyRequests = useCallback(async () => {
    setLoadingRequests(true);
    try {
      const contactQuery = patientContact || storedUser?.email || '';
      const list = await api.finder.myRequests(contactQuery);
      setMyRequests(list || []);
    } catch (err) {
      console.warn('Failed to fetch patient requests:', err);
    } finally {
      setLoadingRequests(false);
    }
  }, [patientContact, storedUser?.email]);

  // Fetch pharmacy verification desk queue
  const fetchDeskRequests = useCallback(async () => {
    setLoadingDesk(true);
    try {
      const pharmId = storedUser?.pharmacy_id || '';
      const list = await api.finder.pharmacyRequests(pharmId);
      setIncomingDeskRequests(list || []);
    } catch (err) {
      console.warn('Failed to fetch desk requests:', err);
    } finally {
      setLoadingDesk(false);
    }
  }, [storedUser?.pharmacy_id]);

  useEffect(() => {
    fetchMyRequests();
    fetchDeskRequests();
  }, [fetchMyRequests, fetchDeskRequests]);

  // Search logic
  const doSearch = useCallback(async (med = query, silent = false) => {
    if (!med || !med.trim()) return;
    if (!silent) setLoading(true);
    if (!silent) setConfirmSuccess(null);
    try {
      const res = await api.finder.search(
        med.trim(),
        patientCoords.lat,
        patientCoords.lng,
        openNow,
        inStockOnly
      );
      let list = res.results || [];
      if (cityFilter !== 'all') {
        list = list.filter((r) => String(r.city || '').toLowerCase() === cityFilter.toLowerCase());
      }
      setResults(list);
      setSubstitutes(res.generic_substitutes || []);
      if (list.length > 0 && !silent) {
        setSelectedResult(list[0]);
      }
    } catch (err) {
      console.error('Search failed:', err);
    } finally {
      if (!silent) setLoading(false);
    }
  }, [query, patientCoords.lat, patientCoords.lng, openNow, inStockOnly, cityFilter]);

  useEffect(() => {
    doSearch();
  }, [doSearch]);

  const handleUseMyLocation = () => {
    if (!navigator.geolocation) {
      alert('Geolocation is not supported by your browser.');
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setPatientCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude, source: 'gps' });
      },
      () => alert('Could not access live GPS — using standard Tamil Nadu coordinates.')
    );
  };

  // Real-time WebSocket updates
  useLiveEvents(['INVENTORY_UPDATED', 'SALE_RECORDED', 'BATCH_VERIFIED', 'DELIVERY_RECEIVED'], () => {
    doSearch(query, true);
  });

  useLiveEvents(['CONFIRMATION_REQUESTED'], (event) => {
    fetchDeskRequests();
    fetchMyRequests();
    setLiveStatusAlert(
      `Live Alert: New medicine request placed for "${event.payload?.medicine}" at ${event.payload?.pharmacy}.`
    );
    setTimeout(() => setLiveStatusAlert(null), 6000);
  });

  useLiveEvents(['CONFIRMATION_UPDATED'], (event) => {
    fetchMyRequests();
    fetchDeskRequests();
    const st = String(event.payload?.status || '').toUpperCase();
    setLiveStatusAlert(
      `Live Status Update: Request for "${event.payload?.medicine || 'Medicine'}" was marked ${st}${event.payload?.notes ? ` — "${event.payload?.notes}"` : ''}.`
    );
    setTimeout(() => setLiveStatusAlert(null), 8000);
  });

  // Submit Medicine Placement / Reservation Request
  const handleSubmitPlacement = async (e) => {
    e.preventDefault();
    if (!confirmTarget) return;
    setSubmittingConfirm(true);
    try {
      const res = await api.finder.confirm({
        pharmacy_id: confirmTarget.pharmacy_id,
        medicine_id: confirmTarget.medicine_id,
        patient_contact: patientContact.trim(),
        patient_name: patientName.trim(),
        quantity_requested: Number(quantityRequested) || 1,
        urgency,
        pickup_preference: pickupPreference,
        notes: notes.trim()
      });
      setConfirmSuccess(res);
      setConfirmModalOpen(false);
      setNotes('');
      fetchMyRequests();
      setActiveTab('my_requests');
    } catch (err) {
      alert('Failed to place medicine request: ' + err.message);
    } finally {
      setSubmittingConfirm(false);
    }
  };

  // Pharmacy Staff Respond to Request
  const handleRespondToRequest = async (requestId, statusValue, responseNotes = '') => {
    setRespondingId(requestId);
    try {
      await api.finder.respondRequest(requestId, {
        status: statusValue,
        notes: responseNotes || (statusValue === 'available' ? 'Stock verified on physical shelf — reserved.' : 'Currently out of stock.')
      });
      fetchDeskRequests();
      fetchMyRequests();
    } catch (err) {
      alert('Failed to update request: ' + err.message);
    } finally {
      setRespondingId(null);
    }
  };

  // Unique city list
  const availableCities = Array.from(
    new Set(pharmaciesList.map((p) => p.city).filter(Boolean))
  ).sort();

  return (
    <div>
      {/* Top Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12, marginBottom: 20 }}>
        <div>
          <h2 style={{ fontSize: 23, fontWeight: 700, margin: 0, color: 'var(--text-primary)' }}>
            Patient Medicine Finder &amp; Live Reservation Desk
          </h2>
          <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 3 }}>
            Locate verified medicines across community pharmacies, place live hold requests, and track verification in real time.
          </p>
        </div>

        {/* Tab Switcher */}
        <div style={{ display: 'flex', background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', padding: 3, gap: 4 }}>
          <button
            type="button"
            className={`btn btn-sm ${activeTab === 'finder' ? 'btn-primary' : 'btn-ghost'}`}
            onClick={() => setActiveTab('finder')}
            style={{ display: 'flex', alignItems: 'center', gap: 6 }}
          >
            <Search size={14} /> Find Medicine
          </button>
          <button
            type="button"
            className={`btn btn-sm ${activeTab === 'my_requests' ? 'btn-primary' : 'btn-ghost'}`}
            onClick={() => { setActiveTab('my_requests'); fetchMyRequests(); }}
            style={{ display: 'flex', alignItems: 'center', gap: 6 }}
          >
            <ShoppingBag size={14} /> My Placed Requests ({myRequests.length})
          </button>
          <button
            type="button"
            className={`btn btn-sm ${activeTab === 'pharmacy_desk' ? 'btn-primary' : 'btn-ghost'}`}
            onClick={() => { setActiveTab('pharmacy_desk'); fetchDeskRequests(); }}
            style={{ display: 'flex', alignItems: 'center', gap: 6 }}
          >
            <ShieldCheck size={14} /> Pharmacy Verification Desk ({incomingDeskRequests.filter(r => r.status === 'pending').length})
          </button>
        </div>
      </div>

      {/* Live status banner */}
      {liveStatusAlert && (
        <div style={{
          padding: '12px 16px',
          background: 'var(--primary-light)',
          color: 'var(--primary)',
          borderRadius: 'var(--radius-sm)',
          marginBottom: 16,
          fontSize: 13,
          fontWeight: 600,
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          border: '1px solid var(--primary)'
        }}>
          <Clock size={16} />
          <span>{liveStatusAlert}</span>
        </div>
      )}

      {confirmSuccess && (
        <div style={{
          padding: '12px 16px',
          background: 'var(--low-bg)',
          color: 'var(--low)',
          borderRadius: 'var(--radius-sm)',
          marginBottom: 16,
          fontSize: 13,
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          border: '1px solid var(--low)'
        }}>
          <CheckCircle2 size={16} />
          <div>
            <b>{confirmSuccess.message}</b>
            <div style={{ fontSize: 11.5, opacity: 0.85, marginTop: 2 }}>
              Tracking ID: <code>{confirmSuccess.id}</code> — Live status will reflect in &quot;My Placed Requests&quot; tab.
            </div>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* TAB 1: MEDICINE FINDER & SEARCH                           */}
      {/* ======================================================== */}
      {activeTab === 'finder' && (
        <>
          {/* Search Controls Card */}
          <div className="card" style={{ marginBottom: 20 }}>
            <form
              onSubmit={(e) => { e.preventDefault(); doSearch(); }}
              style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}
            >
              {/* Medicine Input with suggestions */}
              <div style={{ flex: 1, minWidth: 260, position: 'relative' }}>
                <Search size={18} style={{ position: 'absolute', left: 12, top: 11, color: 'var(--text-muted)' }} />
                <input
                  type="text"
                  className="input"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search medicine brand name, generic molecule, or dosage..."
                  style={{ width: '100%', paddingLeft: 38 }}
                  list="medicine-autocomplete-list"
                />
                <datalist id="medicine-autocomplete-list">
                  {medicinesList.slice(0, 30).map((m) => (
                    <option key={m.id} value={m.name}>{m.generic_name} ({m.strength})</option>
                  ))}
                </datalist>
              </div>

              {/* City Filter */}
              <div style={{ minWidth: 150 }}>
                <select
                  className="input"
                  value={cityFilter}
                  onChange={(e) => setCityFilter(e.target.value)}
                  style={{ width: '100%' }}
                >
                  <option value="all">All Cities (Tamil Nadu)</option>
                  {availableCities.map((city) => (
                    <option key={city} value={city}>{city}</option>
                  ))}
                </select>
              </div>

              {/* Checkboxes & GPS Button */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
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

                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={handleUseMyLocation}
                  title="Detect GPS coordinates to sort pharmacies by real distance"
                >
                  <Navigation size={14} /> {patientCoords.source === 'gps' ? 'GPS Active' : 'Use My GPS'}
                </button>

                <button type="submit" className="btn btn-primary">
                  <Search size={15} /> Search
                </button>
              </div>
            </form>

            {/* Quick-Click Medicine Pills */}
            <div style={{ marginTop: 12, paddingTop: 10, borderTop: '1px solid var(--border-light)', display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 11.5, color: 'var(--text-muted)', fontWeight: 600 }}>POPULAR MEDICINES:</span>
              {['Amoxicillin', 'Paracetamol', 'Azithromycin', 'Metformin', 'Insulin Glargine', 'Pantoprazole', 'Salbutamol', 'Losartan'].map((med) => (
                <button
                  key={med}
                  type="button"
                  onClick={() => { setQuery(med); doSearch(med); }}
                  style={{
                    background: query.toLowerCase() === med.toLowerCase() ? 'var(--primary-light)' : 'var(--bg-hover)',
                    color: query.toLowerCase() === med.toLowerCase() ? 'var(--primary)' : 'var(--text-secondary)',
                    border: '1px solid var(--border)',
                    borderRadius: 14,
                    padding: '3px 10px',
                    fontSize: 11.5,
                    fontWeight: 600,
                    cursor: 'pointer'
                  }}
                >
                  {med}
                </button>
              ))}
            </div>
          </div>

          {/* Results Grid */}
          <div className="grid-cols-2" style={{ alignItems: 'flex-start' }}>
            {/* Pharmacy List */}
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <h3 style={{ fontSize: 15, fontWeight: 700, margin: 0, color: 'var(--text-primary)' }}>
                  Verified Pharmacy Stock ({results.length})
                </h3>
                <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                  Sorted by stock availability &amp; proximity
                </span>
              </div>

              {loading ? (
                <LoadingSkeleton height={110} count={4} />
              ) : results.length === 0 ? (
                <EmptyState
                  icon={Pill}
                  title={`No pharmacies found with stock for "${query}"`}
                  description="Try selecting 'All Cities', unchecking 'In Stock Only', or view recommended generic substitutes below."
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
                        boxShadow: selectedResult === r ? '0 0 0 2px var(--primary-light)' : 'var(--shadow-sm)',
                        transition: 'all 0.16s ease'
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
                        <div>
                          <h4 style={{ fontSize: 15, fontWeight: 700, margin: 0, color: 'var(--text-primary)' }}>
                            {r.pharmacy}
                          </h4>
                          <div style={{ fontSize: 12, color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: 6, marginTop: 4 }}>
                            <MapPin size={13} style={{ color: 'var(--primary)', flexShrink: 0 }} />
                            <span>{r.address || r.city} {r.distance_km != null ? `(${r.distance_km} km away)` : ''}</span>
                          </div>
                        </div>
                        <div>
                          {r.in_stock ? (
                            <span className="badge badge-low" style={{ fontSize: 12, fontWeight: 700 }}>
                              {r.available_quantity} In Stock
                            </span>
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
                        fontSize: 12,
                        flexWrap: 'wrap',
                        gap: 8
                      }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--text-muted)' }}>
                          <Clock size={13} />
                          <span>Shelf verified {r.verified_hours_ago}h ago</span>
                          <span style={{ margin: '0 4px' }}>•</span>
                          <span style={{ color: r.is_open ? 'var(--low)' : 'var(--high)', fontWeight: 600 }}>
                            {r.is_open ? 'Open Now' : 'Closed'}
                          </span>
                        </div>

                        <button
                          className="btn btn-primary btn-sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            setConfirmTarget(r);
                            setConfirmModalOpen(true);
                          }}
                        >
                          <Send size={12} /> Place Request / Hold
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Generic Substitutes */}
              {substitutes.length > 0 && (
                <div className="card" style={{ marginTop: 20, background: 'var(--primary-light)', border: '1px solid var(--border)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                    <Pill size={18} style={{ color: 'var(--primary)' }} />
                    <h4 style={{ fontSize: 14, fontWeight: 700, margin: 0, color: 'var(--text-primary)' }}>
                      Generic &amp; Therapeutic Equivalents
                    </h4>
                  </div>
                  <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 12 }}>
                    Same therapeutic molecule or drug class. Ask your pharmacist or physician:
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
                          <b>{sub.name}</b> <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>({sub.strength})</span>
                          <div style={{ fontSize: 11.5, color: 'var(--primary)', fontWeight: 500 }}>{sub.reason}</div>
                        </div>
                        <button
                          type="button"
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

            {/* Selected Pharmacy Details Panel */}
            <div>
              <div className="card">
                <div className="card-header">
                  <span className="card-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <Building2 size={18} style={{ color: 'var(--primary)' }} />
                    Pharmacy Details &amp; Verification Freshness
                  </span>
                </div>

                {selectedResult ? (
                  <div>
                    {/* Visual Card */}
                    <div style={{
                      padding: 20,
                      background: 'linear-gradient(145deg, #0e1f30 0%, #1a365d 100%)',
                      borderRadius: 'var(--radius-sm)',
                      color: '#ffffff',
                      marginBottom: 16,
                      position: 'relative'
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                        <MapPin size={24} style={{ color: '#38bdf8' }} />
                        <div>
                          <b style={{ fontSize: 16 }}>{selectedResult.pharmacy}</b>
                          <div style={{ fontSize: 12, color: '#94a3b8' }}>
                            {selectedResult.address || selectedResult.city}
                          </div>
                        </div>
                      </div>

                      <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
                        <span style={{ padding: '3px 9px', background: 'rgba(255,255,255,0.12)', borderRadius: 12, fontSize: 11.5 }}>
                          📍 {selectedResult.distance_km != null ? `${selectedResult.distance_km} km away` : 'Tamil Nadu'}
                        </span>
                        <span style={{ padding: '3px 9px', background: 'rgba(255,255,255,0.12)', borderRadius: 12, fontSize: 11.5 }}>
                          ⏰ {selectedResult.is_24_hours ? '24 Hours Service' : '08:00 AM – 10:30 PM'}
                        </span>
                      </div>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, fontSize: 13 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ color: 'var(--text-secondary)' }}>Medicine Selected:</span>
                        <b>{selectedResult.medicine} ({selectedResult.strength || 'Standard Dosage'})</b>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ color: 'var(--text-secondary)' }}>Available Stock:</span>
                        <b style={{ color: selectedResult.in_stock ? 'var(--low)' : 'var(--high)' }}>
                          {selectedResult.available_quantity} unit(s) verified
                        </b>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ color: 'var(--text-secondary)' }}>Contact Phone:</span>
                        <b>{selectedResult.phone || '+91 94432 10987'}</b>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ color: 'var(--text-secondary)' }}>Physical Verification:</span>
                        <b style={{ color: 'var(--low)' }}>Verified {selectedResult.verified_hours_ago}h ago</b>
                      </div>
                    </div>

                    <div style={{ marginTop: 20 }}>
                      <button
                        className="btn btn-primary"
                        style={{ width: '100%', justifyContent: 'center', padding: '11px' }}
                        onClick={() => {
                          setConfirmTarget(selectedResult);
                          setConfirmModalOpen(true);
                        }}
                      >
                        <Send size={15} /> Place Reservation Request with this Pharmacy
                      </button>
                    </div>
                  </div>
                ) : (
                  <EmptyState title="Select a pharmacy from the list to view full branch details." />
                )}
              </div>
            </div>
          </div>
        </>
      )}

      {/* ======================================================== */}
      {/* TAB 2: MY PLACED REQUESTS & LIVE ORDER TRACKING           */}
      {/* ======================================================== */}
      {activeTab === 'my_requests' && (
        <div className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <div>
              <h3 style={{ fontSize: 16, fontWeight: 700, margin: 0 }}>
                My Placed Medicine Requests &amp; Live Status
              </h3>
              <p style={{ fontSize: 12.5, color: 'var(--text-secondary)', marginTop: 2 }}>
                Live updates synced automatically via WebSocket. Tracking requests placed for <b>{patientContact || storedUser?.email || 'Current User'}</b>.
              </p>
            </div>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={fetchMyRequests}
              disabled={loadingRequests}
            >
              <RefreshCw size={13} className={loadingRequests ? 'mp-spin' : ''} /> Refresh
            </button>
          </div>

          {loadingRequests ? (
            <LoadingSkeleton height={80} count={3} />
          ) : myRequests.length === 0 ? (
            <EmptyState
              icon={ShoppingBag}
              title="No medicine requests placed yet"
              description="Search for a medicine in the 'Find Medicine' tab and click 'Place Request / Hold' to submit a dynamic request to pharmacy staff."
            />
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {myRequests.map((req) => {
                const status = (req.status || 'pending').toLowerCase();
                const isConfirmed = ['available', 'confirmed', 'ready_for_pickup'].includes(status);
                const isUnavailable = status === 'unavailable';

                return (
                  <div
                    key={req.id}
                    style={{
                      border: '1px solid var(--border)',
                      borderRadius: 'var(--radius-sm)',
                      padding: 16,
                      background: 'var(--bg-surface)'
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 10 }}>
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <h4 style={{ fontSize: 15, fontWeight: 700, margin: 0, color: 'var(--text-primary)' }}>
                            {req.medicine_name || (req.medicines && req.medicines.name) || 'Medicine'}
                          </h4>
                          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                            ({req.medicine_strength || (req.medicines && req.medicines.strength) || 'Standard'})
                          </span>
                        </div>
                        <div style={{ fontSize: 12.5, color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: 6, marginTop: 4 }}>
                          <Building2 size={13} style={{ color: 'var(--primary)' }} />
                          <span>{req.pharmacy_name || (req.pharmacies && req.pharmacies.name) || 'Pharmacy Branch'}</span>
                          <span>•</span>
                          <span>{req.pickup_preference || 'Counter Pickup'}</span>
                          <span>•</span>
                          <span>Qty: <b>{req.quantity_requested || 1}</b></span>
                        </div>
                      </div>

                      {/* Status Badge */}
                      <div>
                        {isConfirmed && (
                          <span className="badge badge-low" style={{ fontSize: 12.5, fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                            <CheckCircle2 size={14} /> Stock Confirmed &amp; Reserved
                          </span>
                        )}
                        {isUnavailable && (
                          <span className="badge badge-critical" style={{ fontSize: 12.5, fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                            <AlertCircle size={14} /> Out of Stock / Declined
                          </span>
                        )}
                        {!isConfirmed && !isUnavailable && (
                          <span className="badge badge-medium" style={{ fontSize: 12.5, fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                            <Clock size={14} className="mp-spin" /> Pending Staff Verification
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Additional Notes & Response */}
                    <div style={{
                      marginTop: 12,
                      paddingTop: 10,
                      borderTop: '1px solid var(--border-light)',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      fontSize: 12,
                      color: 'var(--text-muted)',
                      flexWrap: 'wrap',
                      gap: 8
                    }}>
                      <div>
                        {req.notes && <span>Patient Notes: &ldquo;{req.notes}&rdquo;</span>}
                        {req.responded_at && (
                          <span style={{ marginLeft: req.notes ? 12 : 0, color: 'var(--text-primary)', fontWeight: 600 }}>
                            Staff Verification Time: {new Date(req.responded_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        )}
                      </div>
                      <div>
                        Request ID: <code>{String(req.id).slice(0, 8)}</code> • Urgency: <b>{req.urgency || 'Normal'}</b>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ======================================================== */}
      {/* TAB 3: PHARMACY VERIFICATION DESK                         */}
      {/* ======================================================== */}
      {activeTab === 'pharmacy_desk' && (
        <div className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <div>
              <h3 style={{ fontSize: 16, fontWeight: 700, margin: 0 }}>
                Pharmacy Staff Medicine Verification &amp; Dispense Desk
              </h3>
              <p style={{ fontSize: 12.5, color: 'var(--text-secondary)', marginTop: 2 }}>
                Live queue of incoming patient hold and availability verification requests. Responding broadcasts live updates to the patient.
              </p>
            </div>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={fetchDeskRequests}
              disabled={loadingDesk}
            >
              <RefreshCw size={13} className={loadingDesk ? 'mp-spin' : ''} /> Refresh Queue
            </button>
          </div>

          {loadingDesk ? (
            <LoadingSkeleton height={90} count={3} />
          ) : incomingDeskRequests.length === 0 ? (
            <EmptyState
              icon={ShieldCheck}
              title="No patient requests in verification queue"
              description="Patient reservation requests placed in the finder will appear here instantly via WebSocket."
            />
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {incomingDeskRequests.map((req) => {
                const isPending = req.status === 'pending';
                const isResponding = respondingId === req.id;

                return (
                  <div
                    key={req.id}
                    style={{
                      border: '1px solid var(--border)',
                      borderRadius: 'var(--radius-sm)',
                      padding: 16,
                      background: isPending ? 'var(--bg-surface)' : 'var(--bg-hover)'
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 10 }}>
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <h4 style={{ fontSize: 15, fontWeight: 700, margin: 0 }}>
                            {req.medicine_name || (req.medicines && req.medicines.name) || 'Medicine'}
                          </h4>
                          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                            ({req.medicine_strength || (req.medicines && req.medicines.strength) || 'Standard'})
                          </span>
                          <span className={`badge ${req.urgency === 'Emergency / Immediate' ? 'badge-critical' : 'badge-low'}`} style={{ fontSize: 11 }}>
                            {req.urgency || 'Normal'}
                          </span>
                        </div>

                        <div style={{ fontSize: 12.5, color: 'var(--text-secondary)', marginTop: 4 }}>
                          Patient: <b>{req.patient_name || 'Patient'}</b> • Contact: <b>{req.patient_contact}</b> • Qty: <b>{req.quantity_requested || 1}</b> • Mode: <b>{req.pickup_preference || 'Counter Pickup'}</b>
                        </div>

                        {req.notes && (
                          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>
                            Prescription/Notes: <i>&ldquo;{req.notes}&rdquo;</i>
                          </div>
                        )}
                      </div>

                      {/* Action buttons */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        {isPending ? (
                          <>
                            <button
                              type="button"
                              className="btn btn-primary btn-sm"
                              disabled={isResponding}
                              onClick={() => handleRespondToRequest(req.id, 'available', 'Physically verified on shelf — reserved for patient collection.')}
                            >
                              <Check size={14} /> Confirm Available &amp; Hold
                            </button>
                            <button
                              type="button"
                              className="btn btn-secondary btn-sm"
                              disabled={isResponding}
                              onClick={() => handleRespondToRequest(req.id, 'unavailable', 'Currently stockout — generic alternative recommended.')}
                            >
                              <X size={14} /> Mark Out of Stock
                            </button>
                          </>
                        ) : (
                          <span className={`badge ${['available', 'confirmed', 'ready_for_pickup'].includes(req.status) ? 'badge-low' : 'badge-critical'}`}>
                            {String(req.status).toUpperCase()}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ======================================================== */}
      {/* PLACE MEDICINE RESERVATION MODAL                         */}
      {/* ======================================================== */}
      <Modal
        isOpen={confirmModalOpen}
        onClose={() => setConfirmModalOpen(false)}
        title={confirmTarget ? `Place Medicine Request with ${confirmTarget.pharmacy}` : 'Place Medicine Request'}
      >
        <form onSubmit={handleSubmitPlacement}>
          <div style={{
            background: 'var(--bg-hover)',
            borderRadius: 'var(--radius-sm)',
            padding: 12,
            marginBottom: 16,
            fontSize: 13
          }}>
            <div>Medicine: <b>{confirmTarget?.medicine || query}</b> ({confirmTarget?.strength || 'Standard'})</div>
            <div>Pharmacy: <b>{confirmTarget?.pharmacy}</b> ({confirmTarget?.city})</div>
            <div>Direct Phone: <b>{confirmTarget?.phone || '+91 98765 43210'}</b></div>
          </div>

          <div className="grid-cols-2" style={{ gap: 12, marginBottom: 12 }}>
            <div>
              <label style={{ display: 'block', fontSize: 12.5, fontWeight: 600, marginBottom: 4 }}>
                Quantity Needed
              </label>
              <input
                type="number"
                min="1"
                max="50"
                className="input"
                style={{ width: '100%' }}
                value={quantityRequested}
                onChange={(e) => setQuantityRequested(Math.max(1, parseInt(e.target.value) || 1))}
                required
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: 12.5, fontWeight: 600, marginBottom: 4 }}>
                Urgency Level
              </label>
              <select
                className="input"
                style={{ width: '100%' }}
                value={urgency}
                onChange={(e) => setUrgency(e.target.value)}
              >
                <option value="Normal">Normal Refill</option>
                <option value="Within 24 Hours">Within 24 Hours</option>
                <option value="Emergency / Immediate">Emergency / Immediate</option>
              </select>
            </div>
          </div>

          <div style={{ marginBottom: 12 }}>
            <label style={{ display: 'block', fontSize: 12.5, fontWeight: 600, marginBottom: 4 }}>
              Pickup Mode
            </label>
            <select
              className="input"
              style={{ width: '100%' }}
              value={pickupPreference}
              onChange={(e) => setPickupPreference(e.target.value)}
            >
              <option value="Counter Pickup">Counter Self-Pickup (Reserved for 24h)</option>
              <option value="Home Delivery Request">Home Delivery Request</option>
            </select>
          </div>

          <div className="grid-cols-2" style={{ gap: 12, marginBottom: 12 }}>
            <div>
              <label style={{ display: 'block', fontSize: 12.5, fontWeight: 600, marginBottom: 4 }}>
                Your Name
              </label>
              <input
                type="text"
                className="input"
                style={{ width: '100%' }}
                value={patientName}
                onChange={(e) => setPatientName(e.target.value)}
                required
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: 12.5, fontWeight: 600, marginBottom: 4 }}>
                Phone or Email (for SMS/Email alert)
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
          </div>

          <div style={{ marginBottom: 16 }}>
            <label style={{ display: 'block', fontSize: 12.5, fontWeight: 600, marginBottom: 4 }}>
              Prescription / Dosage Notes
            </label>
            <textarea
              className="input"
              rows={2}
              style={{ width: '100%' }}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g. 500mg tablets, 1 strip, doctor prescription available."
            />
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => setConfirmModalOpen(false)}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="btn btn-primary"
              disabled={submittingConfirm}
            >
              {submittingConfirm ? 'Submitting...' : 'Submit Medicine Hold Request'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
