import React, { useState } from 'react';
import Modal from './Modal';
import { QrCode, Scan, CheckCircle } from 'lucide-react';

export default function BarcodeScannerModal({ isOpen, onClose, onScanComplete }) {
  const [barcodeInput, setBarcodeInput] = useState('');
  const [scannedResult, setScannedResult] = useState(null);

  const sampleBarcodes = [
    { code: 'BATCH-AMO-482', med: 'Amoxicillin 500mg', exp: '2026-08-15', qty: 100 },
    { code: 'BATCH-MET-112', med: 'Metformin 500mg', exp: '2026-11-20', qty: 150 },
    { code: 'BATCH-AZI-904', med: 'Azithromycin 500mg', exp: '2025-12-10', qty: 50 },
    { code: 'BATCH-TEL-331', med: 'Telmisartan 40mg', exp: '2026-06-30', qty: 80 }
  ];

  const handleSimulateScan = (item) => {
    setBarcodeInput(item.code);
    setScannedResult(item);
  };

  const handleApply = () => {
    if (scannedResult) {
      onScanComplete(scannedResult);
      onClose();
    } else if (barcodeInput) {
      onScanComplete({ code: barcodeInput, med: 'Custom Scanned Item', exp: '2026-12-31', qty: 50 });
      onClose();
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Barcode / QR Scanner Simulator">
      <div>
        <div style={{
          height: 180,
          background: '#0b1d2e',
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
          {/* Laser scanning line animation */}
          <div style={{
            position: 'absolute',
            top: '50%',
            left: 0,
            right: 0,
            height: 2,
            background: 'red',
            boxShadow: '0 0 8px red',
            transform: 'translateY(-50%)'
          }} />
          <Scan size={44} style={{ color: 'var(--primary)', marginBottom: 8, opacity: 0.8 }} />
          <span style={{ fontSize: 13, color: '#a0aec0' }}>Aim camera or USB barcode scanner at packaging</span>
        </div>

        <div style={{ marginBottom: 16 }}>
          <label style={{ display: 'block', fontSize: 13, fontWeight: 500, marginBottom: 6 }}>
            Quick-Select Sample GS1 / QR Barcode
          </label>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {sampleBarcodes.map((item) => (
              <button
                key={item.code}
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => handleSimulateScan(item)}
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
            <span>Decoded GS1 DataMatrix: <b>{scannedResult.code}</b> ({scannedResult.med}, Exp: {scannedResult.exp})</span>
          </div>
        )}

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="btn btn-primary"
            disabled={!barcodeInput}
            onClick={handleApply}
          >
            Insert Batch into Inventory
          </button>
        </div>
      </div>
    </Modal>
  );
}
