import { QRCodeSVG } from "qrcode.react";

// Shown to whoever has physical custody of the goods (volunteer or
// self-delivering donor) once a delivery is marked "delivered". The victim
// scans this with their own device to confirm — see QrScanModal.tsx.
// `details` (category + short delivery id) is rendered directly on the card
// so both the carrier and the confirming victim can see at a glance which
// delivery this is, independent of whatever else is on the surrounding page —
// a real gap when someone scrolls away from the row that gave it context.
export function DeliveryQrCode({
  deliveryId,
  token,
  details,
}: {
  deliveryId: string;
  token: string;
  details?: string;
}) {
  const payload = JSON.stringify({ deliveryId, token });

  return (
    <div className="flex flex-col items-center gap-2 rounded-xl border border-gray-200 bg-white p-4">
      {details && <p className="text-sm font-medium capitalize text-gray-900">{details}</p>}
      <p className="text-xs text-gray-400">Delivery #{deliveryId.slice(0, 6)}</p>
      <QRCodeSVG value={payload} size={160} />
      <p className="text-center text-xs text-gray-500">
        Show this to the recipient — they scan it in the app to confirm receipt.
      </p>
    </div>
  );
}
