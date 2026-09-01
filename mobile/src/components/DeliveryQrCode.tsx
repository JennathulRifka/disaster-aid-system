import { View, Text } from "react-native";
import QRCode from "react-native-qrcode-svg";

// Shown to whoever has physical custody of the goods (volunteer or
// self-delivering donor) once a delivery is marked "delivered". The victim
// scans this with their own device to confirm — see QrScanModal.tsx.
export function DeliveryQrCode({ deliveryId, token }: { deliveryId: string; token: string }) {
  const payload = JSON.stringify({ deliveryId, token });

  return (
    <View className="items-center gap-2 rounded-xl border border-gray-200 bg-white p-4">
      <QRCode value={payload} size={160} />
      <Text className="mt-2 text-center text-xs text-gray-500">
        Show this to the recipient — they scan it in the app to confirm receipt.
      </Text>
    </View>
  );
}
