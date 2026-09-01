import { useState } from "react";
import { Modal, View, Text, TouchableOpacity } from "react-native";
import { CameraView, useCameraPermissions } from "expo-camera";

export function QrScanModal({
  onScan,
  onClose,
}: {
  onScan: (decodedText: string) => void;
  onClose: () => void;
}) {
  const [permission, requestPermission] = useCameraPermissions();
  const [scanned, setScanned] = useState(false);

  function handleBarcodeScanned({ data }: { data: string }) {
    if (scanned) return;
    setScanned(true);
    onScan(data);
  }

  return (
    <Modal visible animationType="slide" onRequestClose={onClose}>
      <View className="flex-1 bg-black">
        <View className="flex-row items-center justify-between bg-black px-4 py-4">
          <Text className="text-sm font-semibold text-white">Scan to confirm</Text>
          <TouchableOpacity onPress={onClose}>
            <Text className="text-sm text-gray-300">Close</Text>
          </TouchableOpacity>
        </View>

        {!permission ? (
          <View className="flex-1 items-center justify-center">
            <Text className="text-white">Loading camera...</Text>
          </View>
        ) : !permission.granted ? (
          <View className="flex-1 items-center justify-center px-8">
            <Text className="mb-4 text-center text-white">
              Camera access is needed to scan the delivery confirmation QR code.
            </Text>
            <TouchableOpacity onPress={requestPermission} className="rounded bg-orange-600 px-4 py-2">
              <Text className="font-medium text-white">Grant camera access</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <CameraView
            style={{ flex: 1 }}
            facing="back"
            barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
            onBarcodeScanned={scanned ? undefined : handleBarcodeScanned}
          />
        )}
      </View>
    </Modal>
  );
}
