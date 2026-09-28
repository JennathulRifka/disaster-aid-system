import { useEffect, useState } from "react";
import { View, Text, TouchableOpacity, Modal, AccessibilityInfo } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { AppText } from "./AppText";

const STEPS = [
  { titleKey: "mapWalkthrough.step1Title", bodyKey: "mapWalkthrough.step1Body" },
  { titleKey: "mapWalkthrough.step2Title", bodyKey: "mapWalkthrough.step2Body" },
  { titleKey: "mapWalkthrough.step3Title", bodyKey: "mapWalkthrough.step3Body" },
];

/**
 * Mobile port of web's MapWalkthroughModal.tsx — a 3-step onboarding
 * carousel, shown once automatically (see useMapWalkthrough) and reopenable
 * from the accessibility control's "Help / Tour" button. A plain centered
 * Modal, same reasoning as web: works identically regardless of screen
 * size/tab state, no per-element coordinate math.
 */
export function MapWalkthroughModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useTranslation();
  const [step, setStep] = useState(0);
  const isLast = step === STEPS.length - 1;
  const current = STEPS[step];

  // Same rationale as every other plain-View/Modal detail surface in this
  // app (see SituationMapScreen.tsx's detail card) — announce step changes
  // explicitly, since nothing else tells a screen reader the content changed.
  useEffect(() => {
    if (!open) return;
    AccessibilityInfo.announceForAccessibility(`${t(current.titleKey)}. ${t(current.bodyKey)}`);
  }, [open, step]);

  function close() {
    setStep(0);
    onClose();
  }

  return (
    <Modal visible={open} transparent animationType="fade" onRequestClose={close}>
      <View className="flex-1 items-center justify-center bg-black/50 px-6" accessibilityViewIsModal>
        <TouchableOpacity
          className="absolute inset-0"
          activeOpacity={1}
          onPress={close}
          importantForAccessibility="no"
          accessibilityElementsHidden
        />
        <View className="w-full max-w-sm rounded-2xl bg-white p-6">
          <View className="flex-row items-start justify-between">
            <Text className="text-xs font-medium uppercase tracking-wide text-orange-600">
              {t("mapWalkthrough.stepCounter", { current: step + 1, total: STEPS.length })}
            </Text>
            <TouchableOpacity onPress={close} accessibilityRole="button" accessibilityLabel={t("common.close")}>
              <Ionicons name="close" size={18} color="#9ca3af" />
            </TouchableOpacity>
          </View>
          <AppText
            baseSize={18}
            className="mt-2 font-semibold text-gray-900"
            accessibilityLiveRegion="polite"
          >
            {t(current.titleKey)}
          </AppText>
          <AppText baseSize={14} muted className="mt-2 text-gray-600">
            {t(current.bodyKey)}
          </AppText>
          <View className="mt-5 flex-row items-center justify-between">
            <TouchableOpacity onPress={close} accessibilityRole="button">
              <Text className="text-sm text-gray-500">{t("common.skip")}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => (isLast ? close() : setStep((s) => s + 1))}
              accessibilityRole="button"
              className="rounded bg-orange-600 px-4 py-2"
            >
              <Text className="text-sm font-medium text-white">{isLast ? t("common.gotIt") : t("common.next")}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}
