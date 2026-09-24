import { View, Text } from "react-native";
import QRCode from "react-native-qrcode-svg";

// Shown to whoever has physical custody of the goods (volunteer or
// self-delivering donor) once a delivery is marked "delivered". The victim
// scans this with their own device to confirm — see QrScanModal.tsx.
// `details` (category + short delivery id) renders directly on the card so
// both the carrier and the confirming victim can see at a glance which
// delivery this is, independent of the surrounding screen's own context.
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
    <View className="items-center gap-2 rounded-xl border border-gray-200 bg-white p-4">
      {details && <Text className="text-sm font-medium capitalize text-gray-900">{details}</Text>}
      <Text className="text-xs text-gray-400">Delivery #{deliveryId.slice(0, 6)}</Text>
      <QRCode value={payload} size={160} />
      <Text className="mt-2 text-center text-xs text-gray-500">
        Show this to the recipient — they scan it in the app to confirm receipt.
      </Text>
    </View>
  );
}
