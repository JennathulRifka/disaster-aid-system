import { useEffect, useRef, useState } from "react";
import { Html5Qrcode } from "html5-qrcode";
import { useTranslation } from "react-i18next";
import { useDialogA11y } from "@/hooks/useDialogA11y";

const READER_ELEMENT_ID = "qr-scan-reader";

export function QrScanModal({
  onScan,
  onClose,
}: {
  onScan: (decodedText: string) => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const [error, setError] = useState("");
  const dialogRef = useDialogA11y(true, onClose);

  useEffect(() => {
    const scanner = new Html5Qrcode(READER_ELEMENT_ID);
    scannerRef.current = scanner;
    let cancelled = false;

    scanner
      .start(
        { facingMode: "environment" },
        { fps: 10, qrbox: 220 },
        (decodedText) => {
          if (cancelled) return;
          cancelled = true;
          onScan(decodedText);
        },
        () => {
          // per-frame "no QR found yet" — expected constantly while scanning, ignore
        }
      )
      .catch(() => {
        setError("Couldn't access the camera. Check browser camera permissions.");
      });

    return () => {
      cancelled = true;
      scanner.stop().then(() => scanner.clear()).catch(() => {});
    };
  }, [onScan]);

  return (
    // z-[1200]: above Leaflet's own map panes/controls (raw z-index up to 1000),
    // same fix as SosButton.tsx's modal, kept consistent in case this is ever
    // opened over a page with a map.
    <div
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-labelledby="qr-scan-dialog-title"
      tabIndex={-1}
      className="fixed inset-0 z-[1200] flex items-center justify-center bg-black/50 p-4"
    >
      <div className="w-full max-w-sm rounded-xl bg-white p-4">
        <div className="mb-3 flex items-center justify-between">
          <h3 id="qr-scan-dialog-title" className="text-sm font-semibold text-gray-900">
            {t("victimMyRequests.scanToConfirm")}
          </h3>
          <button onClick={onClose} className="text-sm text-gray-500 hover:text-gray-700">
            {t("common.close")}
          </button>
        </div>
        <div id={READER_ELEMENT_ID} className="overflow-hidden rounded" />
        {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
      </div>
    </div>
  );
}
