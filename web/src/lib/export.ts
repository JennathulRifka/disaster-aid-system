// Shared CSV/PDF export helpers — used by AdminRequests.tsx and
// AdminDonations.tsx to download the currently visible (filtered) table.
// Both just need "an array of rows + column headers in, a file out," so this
// stays generic rather than each page rolling its own.

import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

function downloadBlob(filename: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function csvEscape(value: unknown) {
  const str = String(value ?? "");
  return /[",\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
}

export function exportToCsv(filename: string, headers: string[], rows: (string | number)[][]) {
  const lines = [headers, ...rows].map((row) => row.map(csvEscape).join(","));
  downloadBlob(filename, new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" }));
}

export function exportToPdf(filename: string, title: string, headers: string[], rows: (string | number)[][]) {
  const doc = new jsPDF({ orientation: "landscape" });
  doc.setFontSize(14);
  doc.text(title, 14, 15);
  doc.setFontSize(9);
  doc.text(`Generated ${new Date().toLocaleString()} — ${rows.length} row${rows.length === 1 ? "" : "s"}`, 14, 21);
  autoTable(doc, {
    head: [headers],
    body: rows,
    startY: 26,
    styles: { fontSize: 8 },
    headStyles: { fillColor: [37, 99, 235] },
  });
  doc.save(filename);
}
