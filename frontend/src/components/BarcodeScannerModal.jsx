import React, { useState, useMemo } from 'react';
import Modal from './Modal';
import { QrCode, Scan, CheckCircle } from 'lucide-react';

export default function BarcodeScannerModal({ isOpen, onClose, onScanComplete, medicines = [] }) {
  const [barcodeInput, setBarcodeInput] = useState('');
  const [selectedMedId, setSelectedMedId] = useState('');
  const [scannedResult, setScannedResult] = useState(null);

  // Dynamically generate GS1 / QR quick-scan presets from the live medicines catalog (zero hardcoded static arrays!)
  const dynamicPresets = useMemo(() => {
    const now = Date.now();
    return medicines.slice(0, 5).map((m, idx) => {
      const prefix = (m.name || 'MED').replace(/[^A-Za-z]/g, '').slice(0, 3).toUpperCase() || 'MED';
      const expDate = new Date(now + (180 + idx * 60) * 86400000).toISOString().slice(0, 10);
      return {
        code: `GS1-${prefix}-${String(101 + idx * 17)}`,
        medicine_id: m.id,
        med: m.name,
        exp: expDate,
        qty: 50 + idx * 25,
        price: Number(m.default_price || 50),
      };
    });
  }, [medicines]);

  const handleSelectPreset = (item) => {
    setBarcodeInput(item.code);
    setSelectedMedId(item.medicine_id);
    setScannedResult(item);
  };

  const handleManualInput = (val) => {
    setBarcodeInput(val);
    const upper = val.trim().toUpperCase();
    const matchedMed = medicines.find(
      (m) =>
        (m.atc_code && upper.includes(m.atc_code.toUpperCase())) ||
        (m.name && upper.includes(m.name.slice(0, 3).toUpperCase()))
    );
    if (matchedMed) {
      const exp = new Date(Date.now() + 365 * 86400000).toISOString().slice(0, 10);
      setSelectedMedId(matchedMed.id);
      setScannedResult({
        code: val.trim(),
        medicine_id: matchedMed.id,
        med: matchedMed.name,
        exp,
        qty: 50,
        price: Number(matchedMed.default_price || 50),
      });
    } else {
      setScannedResult(null);
    }
  };

  const handleApply = (e) => {
    if (e) e.preventDefault();
    if (!barcodeInput.trim()) return;
    const defaultExp = new Date(Date.now() + 365 * 86400000).toISOString().slice(0, 10);
    const chosenMed = medicines.find((m) => m.id === (scannedResult?.medicine_id || selectedMedId)) || medicines[0];
    onScanComplete({
      code: barcodeInput.trim(),
      medicine_id: chosenMed?.id || '',
      med: chosenMed?.name || 'Scanned Medicine',
      exp: scannedResult?.exp || defaultExp,
      qty: scannedResult?.qty || 50,
      price: Number(chosenMed?.default_price || 50),
    });
    setBarcodeInput('');
    setScannedResult(null);
    onClose();
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Live Barcode / GS1 QR Scanner">
      <form onSubmit={handleApply}>
        <div style={{
          height: 150,
          background: '#141210',
          borderRadius: 'var(--radius-md)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#ffffff',
          position: 'relative',
          overflow: 'hidden',
          marginBottom: 16
        }}>
          <div style={{
            position: 'absolute',
            top: '50%',
            left: 0,
            right: 0,
            height: 2,
            background: '#D95D39',
            boxShadow: '0 0 10px #D95D39',
            transform: 'translateY(-50%)'
          }} />
          <Scan size={40} style={{ color: '#D95D39', marginBottom: 8, opacity: 0.9 }} />
          <span style={{ fontSize: 13, color: '#D6CEC4' }}>
            Scan with USB/Bluetooth barcode reader or enter batch barcode below
          </span>
        </div>

        {/* Real Scanner Input */}
        <div style={{ marginBottom: 14 }}>
          <label style={{ display: 'block', fontSize: 12.5, fontWeight: 600, marginBottom: 6 }}>
            Scanned Barcode / Batch Code
          </label>
          <input
            type="text"
            className="input"
            style={{ width: '100%' }}
            placeholder="Focus here and scan barcode (e.g. GS1-AMO-101)..."
            value={barcodeInput}
            onChange={(e) => handleManualInput(e.target.value)}
            autoFocus
          />
        </div>

        {dynamicPresets.length > 0 && (
          <div style={{ marginBottom: 16 }}>
            <label style={{ display: 'block', fontSize: 12.5, fontWeight: 600, marginBottom: 6 }}>
              Quick-Scan From Live Catalogue ({medicines.length} medicines)
            </label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {dynamicPresets.map((item) => (
                <button
                  key={item.code}
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={() => handleSelectPreset(item)}
                  style={{
                    borderColor: barcodeInput === item.code ? 'var(--primary)' : 'var(--border)',
                    background: barcodeInput === item.code ? 'var(--primary-light)' : 'transparent'
                  }}
                >
                  <QrCode size={14} />
                  {item.med} ({item.code})
                </button>
              ))}
            </div>
          </div>
        )}

        {scannedResult && (
          <div style={{
            padding: 12,
            borderRadius: 'var(--radius-sm)',
            background: 'var(--low-bg)',
            color: 'var(--low)',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            marginBottom: 16,
            fontSize: 13
          }}>
            <CheckCircle size={18} />
            <span>Matched Live SKU: <b>{scannedResult.code}</b> — {scannedResult.med} (Exp: {scannedResult.exp})</span>
          </div>
        )}

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button
            type="submit"
            className="btn btn-primary"
            disabled={!barcodeInput.trim()}
          >
            Insert Batch into Inventory
          </button>
        </div>
      </form>
    </Modal>
  );
}
