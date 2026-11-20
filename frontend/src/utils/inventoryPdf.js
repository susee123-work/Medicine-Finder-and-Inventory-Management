import jsPDF from 'jspdf';
import 'jspdf-autotable';

/**
 * Generate a comprehensive, executive multi-section FEFO Inventory PDF Report.
 */
export function generateInventoryPDF({ pharmacy, batches = [], deliveries = [], generatedBy = 'Staff' }) {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();

  const todayStr = new Date().toISOString().slice(0, 10);
  const thirtyDaysStr = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);

  // Compute live KPI summary metrics
  const totalBatches = batches.length;
  const totalUnits = batches.reduce((acc, b) => acc + Number(b.quantity || 0), 0);
  const totalValuation = batches.reduce(
    (acc, b) => acc + Number(b.quantity || 0) * Number(b.unit_cost || b.selling_price || 0),
    0
  );
  const expiredBatches = batches.filter((b) => b.expiry_date && b.expiry_date < todayStr);
  const nearExpiryBatches = batches.filter(
    (b) => b.expiry_date && b.expiry_date >= todayStr && b.expiry_date <= thirtyDaysStr && Number(b.quantity || 0) > 0
  );
  const lowStockBatches = batches.filter((b) => Number(b.quantity || 0) > 0 && Number(b.quantity || 0) < 10);
  const depletedBatches = batches.filter((b) => Number(b.quantity || 0) === 0);

  // 1. Header Banner (Obsidian & Copper — non-blue)
  doc.setFillColor(20, 18, 16);
  doc.rect(0, 0, pageWidth, 28, 'F');
  doc.setFillColor(217, 93, 57);
  doc.rect(0, 28, pageWidth, 2, 'F');

  doc.setTextColor(250, 248, 245);
  doc.setFontSize(17);
  doc.setFont('helvetica', 'bold');
  doc.text('MediPulse AI — Live FEFO Inventory & Audit Report', 14, 12);

  doc.setFontSize(9.5);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(214, 206, 196);
  const pharmTitle = pharmacy ? `${pharmacy.name} (${pharmacy.city || ''})` : 'All Pharmacies';
  doc.text(`Pharmacy: ${pharmTitle}`, 14, 19);
  doc.text(`Generated: ${new Date().toLocaleString()}  |  Prepared by: ${generatedBy}`, 14, 24.5);

  doc.setFontSize(9);
  doc.setTextColor(224, 109, 68);
  doc.text(`License: ${pharmacy?.license_number || 'VERIFIED'}`, pageWidth - 14, 19, { align: 'right' });
  doc.setTextColor(214, 206, 196);
  doc.text(`Report Date: ${todayStr}`, pageWidth - 14, 24.5, { align: 'right' });

  // 2. KPI Summary Cards Strip
  const kpis = [
    { label: 'ACTIVE BATCHES', value: String(totalBatches), color: [20, 18, 16] },
    { label: 'TOTAL UNITS ON HAND', value: totalUnits.toLocaleString('en-IN'), color: [13, 148, 104] },
    { label: 'STOCK VALUATION (INR)', value: `INR ${Math.round(totalValuation).toLocaleString('en-IN')}`, color: [217, 93, 57] },
    { label: 'EXPIRING < 30 DAYS', value: String(nearExpiryBatches.length), color: [194, 120, 3] },
    { label: 'EXPIRED BATCHES', value: String(expiredBatches.length), color: [185, 28, 28] },
    { label: 'CRITICAL / DEPLETED', value: `${lowStockBatches.length} / ${depletedBatches.length}`, color: [185, 28, 28] },
  ];

  const cardGap = 4;
  const cardWidth = (pageWidth - 28 - cardGap * (kpis.length - 1)) / kpis.length;
  const cardY = 35;

  kpis.forEach((k, idx) => {
    const x = 14 + idx * (cardWidth + cardGap);
    doc.setFillColor(247, 244, 238);
    doc.setDrawColor(228, 221, 210);
    doc.roundedRect(x, cardY, cardWidth, 16, 2, 2, 'FD');

    doc.setFontSize(7);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(120, 113, 108);
    doc.text(k.label, x + 3, cardY + 5.5);

    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...k.color);
    doc.text(k.value, x + 3, cardY + 12.5);
  });

  // 3. Main Inventory Batches Table (FEFO Order)
  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(20, 18, 16);
  doc.text('1. Active Inventory Batches (Ordered by FEFO — First-Expired, First-Out)', 14, 58);

  const getBatchStatus = (b) => {
    if (b.expiry_date && b.expiry_date < todayStr) return 'EXPIRED';
    if (Number(b.quantity || 0) === 0) return 'DEPLETED';
    if (b.expiry_date && b.expiry_date <= thirtyDaysStr) return 'EXPIRING <30D';
    if (Number(b.quantity || 0) < 10) return 'CRITICAL LOW';
    return 'GOOD STOCK';
  };

  const batchRows = batches.map((b, i) => {
    const med = b.medicines || {};
    const qty = Number(b.quantity || 0);
    const unitVal = Number(b.unit_cost || b.selling_price || 0);
    const lineVal = qty * unitVal;
    return [
      i + 1,
      med.name || 'Medicine',
      med.generic_name || '—',
      med.therapeutic_category || 'General',
      b.batch_no || '—',
      qty,
      unitVal > 0 ? `INR ${unitVal.toFixed(2)}` : '—',
      lineVal > 0 ? `INR ${Math.round(lineVal).toLocaleString('en-IN')}` : '—',
      b.expiry_date || '—',
      getBatchStatus(b),
      b.verified_at ? new Date(b.verified_at).toLocaleDateString() : 'Unverified',
    ];
  });

  doc.autoTable({
    startY: 61,
    head: [[
      '#', 'Medicine Name', 'Generic Molecule', 'Category', 'Batch No',
      'Qty', 'Unit Cost', 'Valuation', 'Expiry Date', 'Status', 'Verified'
    ]],
    body: batchRows.length > 0 ? batchRows : [['—', 'No inventory batches found', '', '', '', '', '', '', '', '', '']],
    theme: 'grid',
    headStyles: { fillColor: [20, 18, 16], textColor: [250, 248, 245], fontSize: 8, fontStyle: 'bold' },
    styles: { fontSize: 7.5, cellPadding: 2.2, textColor: [28, 25, 23] },
    alternateRowStyles: { fillColor: [252, 250, 247] },
    columnStyles: {
      0: { cellWidth: 8, halign: 'center' },
      5: { halign: 'right', fontStyle: 'bold' },
      6: { halign: 'right' },
      7: { halign: 'right' },
      9: { fontStyle: 'bold', halign: 'center' },
    },
    didParseCell: (data) => {
      if (data.section === 'body' && data.column.index === 9) {
        const val = data.cell.raw;
        if (val === 'EXPIRED' || val === 'CRITICAL LOW') {
          data.cell.styles.textColor = [185, 28, 28];
          data.cell.styles.fillColor = [254, 242, 242];
        } else if (val === 'EXPIRING <30D' || val === 'DEPLETED') {
          data.cell.styles.textColor = [180, 83, 9];
          data.cell.styles.fillColor = [255, 251, 235];
        } else {
          data.cell.styles.textColor = [13, 148, 104];
          data.cell.styles.fillColor = [236, 253, 245];
        }
      }
    },
  });

  // 4. Expiring & Critical Action Watchlist (if any)
  const watchlist = batches.filter((b) => {
    const st = getBatchStatus(b);
    return st === 'EXPIRED' || st === 'EXPIRING <30D' || st === 'CRITICAL LOW';
  });

  let nextY = (doc.lastAutoTable?.finalY || 90) + 10;
  if (watchlist.length > 0) {
    if (nextY > pageHeight - 40) {
      doc.addPage();
      nextY = 18;
    }
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(185, 28, 28);
    doc.text(`2. Immediate Action Watchlist — Expired, Expiring (<30d) & Critical Low (${watchlist.length} items)`, 14, nextY);

    doc.autoTable({
      startY: nextY + 3,
      head: [['Medicine', 'Batch No', 'Qty On Hand', 'Expiry Date', 'Alert Status', 'Recommended Action']],
      body: watchlist.map((b) => {
        const st = getBatchStatus(b);
        const rec = st === 'EXPIRED'
          ? 'Quarantine & remove from dispensing shelf'
          : st === 'EXPIRING <30D'
            ? 'Prioritize FEFO dispensing / supplier return'
            : 'Trigger immediate replenishment PO';
        return [
          b.medicines?.name || 'Medicine',
          b.batch_no || '—',
          `${b.quantity} units`,
          b.expiry_date || '—',
          st,
          rec,
        ];
      }),
      theme: 'grid',
      headStyles: { fillColor: [185, 28, 28], textColor: [255, 255, 255], fontSize: 8 },
      styles: { fontSize: 7.8, cellPadding: 2.3 },
    });
    nextY = (doc.lastAutoTable?.finalY || nextY) + 10;
  }

  // 5. Purchase Orders & Deliveries Summary (if present)
  if (deliveries.length > 0) {
    if (nextY > pageHeight - 40) {
      doc.addPage();
      nextY = 18;
    }
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(20, 18, 16);
    doc.text(`3. Purchase Orders & Supplier Deliveries (${deliveries.length} records)`, 14, nextY);

    doc.autoTable({
      startY: nextY + 3,
      head: [['Medicine', 'Supplier', 'Ordered On', 'Expected On', 'Qty Ordered', 'Status', 'Lead Time', 'Delay']],
      body: deliveries.slice(0, 30).map((d) => [
        d.medicines?.name || 'Medicine',
        d.suppliers?.name || 'Distributor',
        d.ordered_on || '—',
        d.expected_on || '—',
        `${d.quantity_ordered} units`,
        d.status || '—',
        d.lead_time_days ? `${d.lead_time_days}d` : 'Pending',
        d.delay_days > 0 ? `+${d.delay_days}d late` : 'On Time',
      ]),
      theme: 'grid',
      headStyles: { fillColor: [68, 64, 60], textColor: [255, 255, 255], fontSize: 8 },
      styles: { fontSize: 7.5, cellPadding: 2.1 },
    });
  }

  // 6. Page Footers on every page
  const pageCount = doc.internal.getNumberOfPages();
  for (let p = 1; p <= pageCount; p += 1) {
    doc.setPage(p);
    doc.setDrawColor(228, 221, 210);
    doc.line(14, pageHeight - 11, pageWidth - 14, pageHeight - 11);
    doc.setFontSize(7.5);
    doc.setTextColor(120, 113, 108);
    doc.text('MediPulse AI · Real-Time Predictive Medicine Availability & Warehouse System', 14, pageHeight - 6.5);
    doc.text(`Page ${p} of ${pageCount}`, pageWidth - 14, pageHeight - 6.5, { align: 'right' });
  }

  const safePharm = (pharmacy?.name || 'All_Pharmacies').replace(/[^A-Za-z0-9]+/g, '_');
  doc.save(`MediPulse_Inventory_Report_${safePharm}_${todayStr}.pdf`);
}
