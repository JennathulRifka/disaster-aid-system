import { useState } from "react";
import { View, Text, TouchableOpacity, Modal } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { useAccessibility, type FontScale } from "../context/AccessibilityContext";
import { AppText } from "./AppText";

const SCALE_LABEL: Record<FontScale, string> = { normal: "A", large: "A+", xlarge: "A++" };

/**
 * Mobile port of web's AccessibilityControls.tsx — a small "Aa" button
 * opening a text-size + high-contrast panel, plus a shortcut back into the
 * map walkthrough. Same sibling-backdrop Modal pattern HomeScreen.tsx's
 * welcome modal already uses (a full-screen dismiss TouchableOpacity as a
 * sibling of the panel, not a parent — nesting the panel inside the
 * backdrop's own touchable would make every tap on the panel itself also
 * dismiss it).
 */
export function AccessibilityControls({ onShowHelp }: { onShowHelp?: () => void }) {
  const { t } = useTranslation();
  const { fontScaleKey, setFontScaleKey, highContrast, setHighContrast } = useAccessibility();
  const [open, setOpen] = useState(false);

  return (
    <View>
      <TouchableOpacity
        onPress={() => setOpen(true)}
        accessibilityRole="button"
        accessibilityLabel={t("common.accessibilityOptions")}
        className="h-9 w-9 items-center justify-center rounded-full border border-gray-300 bg-white"
      >
        <Text className="text-sm font-semibold text-gray-700">Aa</Text>
      </TouchableOpacity>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <View className="flex-1" accessibilityViewIsModal>
          <TouchableOpacity
            className="absolute inset-0"
            activeOpacity={1}
            onPress={() => setOpen(false)}
            importantForAccessibility="no"
            accessibilityElementsHidden
          />
          <View className="mr-4 mt-16 items-end px-4">
            <View
              className="w-56 rounded-lg border border-gray-200 bg-white p-3"
              accessibilityRole="none"
              style={{ elevation: 4, shadowColor: "#000", shadowOpacity: 0.15, shadowRadius: 6, shadowOffset: { width: 0, height: 2 } }}
            >
              <AppText baseSize={11} className="mb-1.5 font-semibold uppercase tracking-wide text-gray-500">
                {t("common.textSize")}
              </AppText>
              <View className="flex-row" style={{ gap: 8 }} accessibilityRole="radiogroup" accessibilityLabel={t("common.textSize")}>
                {(Object.keys(SCALE_LABEL) as FontScale[]).map((s) => (
                  <TouchableOpacity
                    key={s}
                    onPress={() => setFontScaleKey(s)}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: fontScaleKey === s, checked: fontScaleKey === s }}
                    className={`flex-1 items-center rounded border px-2 py-1 ${
                      fontScaleKey === s ? "border-orange-600 bg-orange-50" : "border-gray-300"
                    }`}
                  >
                    <Text className={`text-xs font-medium ${fontScaleKey === s ? "text-orange-700" : "text-gray-600"}`}>
                      {SCALE_LABEL[s]}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <TouchableOpacity
                onPress={() => setHighContrast(!highContrast)}
                accessibilityRole="switch"
                accessibilityState={{ checked: highContrast }}
                className="mt-3 flex-row items-center justify-between"
              >
                <AppText baseSize={12} className="text-gray-700">{t("common.highContrast")}</AppText>
                <View className={`h-5 w-9 justify-center rounded-full ${highContrast ? "bg-orange-600" : "bg-gray-300"}`} style={{ padding: 2 }}>
                  <View className="h-4 w-4 rounded-full bg-white" style={{ marginLeft: highContrast ? 16 : 0 }} />
                </View>
              </TouchableOpacity>

              {onShowHelp && (
                <TouchableOpacity
                  onPress={() => {
                    setOpen(false);
                    onShowHelp();
                  }}
                  accessibilityRole="button"
                  className="mt-3 flex-row items-center justify-center rounded border border-gray-300 px-2 py-1.5"
                  style={{ gap: 6 }}
                >
                  <Ionicons name="help-circle-outline" size={14} color="#4b5563" />
                  <Text className="text-xs text-gray-600">{t("common.helpTour")}</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}
