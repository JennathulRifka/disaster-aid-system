import { useEffect, useState } from "react";
import { View, Text, ScrollView, TouchableOpacity, ActivityIndicator, Modal } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { AuthStackParamList } from "../../navigation/types";
import { LanguageSwitcher } from "../../components/LanguageSwitcher";
import { StatCard } from "../../components/StatCard";
import { AreaSeverityMap } from "../../components/AreaSeverityMap";
import { apiFetch } from "../../lib/api";

type Props = NativeStackScreenProps<AuthStackParamList, "Home">;

interface Stats {
  totalRequests: number;
  completedDeliveries: number;
  totalVolunteers: number;
  districtsReached: number;
}

// Condensed to icon + one-line label only (no description paragraphs) — see
// the "optimize the landing page, too much information" follow-on in
// CLAUDE.md. The full step-by-step explanation lives on web's Landing.tsx;
// a phone screen just needs the gist before funneling into the welcome
// modal / Get Started button, not the full pitch.
const HOW_IT_WORKS = [
  { icon: "document-text-outline" as const, titleKey: "landing.step1Title" },
  { icon: "people-outline" as const, titleKey: "landing.step2Title" },
  { icon: "checkmark-done-outline" as const, titleKey: "landing.step3Title" },
];

const ROLE_ICONS = [
  { icon: "alert-circle-outline" as const, titleKey: "landing.forVictimsTitle" },
  { icon: "gift-outline" as const, titleKey: "landing.forDonorsTitle" },
  { icon: "car-outline" as const, titleKey: "landing.forVolunteersTitle" },
];

// The public landing experience for logged-out users — a condensed take on
// web's Landing.tsx (hero + live stats + a quick how-it-works/roles glance),
// deliberately much shorter than web's full pitch since a phone screen
// rewards brevity and the welcome modal below already puts Sign in/Register
// one tap away. Before this screen existed, RootNavigator sent every
// logged-out user straight to LoginScreen with zero context about what the
// app is. The map itself is hidden behind a "View map" toggle rather than
// always rendered — react-native-maps is a genuinely heavy native view to
// mount unconditionally on the very first screen a user sees, and this way
// a user who never taps it never pays that cost. Tapping it reveals the same
// shared AreaSeverityMap component used everywhere else on mobile, which
// already renders the full 6-tab set (Areas/Gauges/Reservoirs/GDACS/
// Earthquakes/Flood Risk) — matching web's Landing.tsx now showing all tabs.
export function HomeScreen({ navigation }: Props) {
  const { t } = useTranslation();
  const [stats, setStats] = useState<Stats | null>(null);
  const [showMap, setShowMap] = useState(false);
  // Defaults open on every mount — the "when the app is opened" welcome
  // prompt. Closing it (the ✕, the backdrop, or Android's back button) just
  // dismisses to reveal this same screen's content underneath (the "page
  // with details"), which is already rendered behind the modal, not a
  // second navigation. Deliberately no "seen it once" persistence (e.g.
  // AsyncStorage) — it's a lightweight quick-access prompt, not a one-time
  // onboarding tour, so reappearing every time a logged-out user lands back
  // on Home (cold app start, after closing Login/Register, or logging out)
  // is the expected, simple behavior.
  const [welcomeVisible, setWelcomeVisible] = useState(true);

  useEffect(() => {
    apiFetch("/api/stats")
      .then(setStats)
      .catch(() => setStats(null));
  }, []);

  function goTo(screen: "Login" | "Register") {
    setWelcomeVisible(false);
    navigation.navigate(screen);
  }

  return (
    <ScrollView className="flex-1 bg-gray-50" contentContainerStyle={{ padding: 24, paddingTop: 56 }}>
      <View className="mb-6 flex-row justify-end">
        <LanguageSwitcher />
      </View>

      <Text className="text-2xl font-bold text-gray-900">Disaster Aid</Text>
      <Text className="text-sm text-gray-500">Sri Lanka</Text>

      <Text className="mt-6 text-xl font-semibold text-gray-900">{t("landing.heroTitle")}</Text>
      <Text className="mt-2 text-sm leading-5 text-gray-600">{t("landing.heroSubtitle")}</Text>

      <View className="mt-6 flex-row flex-wrap justify-between" style={{ gap: 12 }}>
        {stats ? (
          <>
            <StatCard label={t("landing.statRequests")} value={stats.totalRequests} />
            <StatCard label={t("landing.statDeliveries")} value={stats.completedDeliveries} />
            <StatCard label={t("landing.statVolunteers")} value={stats.totalVolunteers} />
            <StatCard label={t("landing.statDistricts")} value={stats.districtsReached} />
          </>
        ) : (
          <View className="w-full items-center py-6">
            <ActivityIndicator color="#ea580c" />
          </View>
        )}
      </View>

      <TouchableOpacity onPress={() => goTo("Register")} className="mt-8 items-center rounded bg-orange-600 py-3">
        <Text className="font-medium text-white">{t("common.getStarted")}</Text>
      </TouchableOpacity>

      <TouchableOpacity onPress={() => goTo("Login")} className="mt-3 items-center py-1">
        <Text className="text-sm font-medium text-slate-700">{t("common.signIn")}</Text>
      </TouchableOpacity>

      <View className="mt-8 border-t border-gray-100 pt-6">
        <Text className="text-center text-xs font-semibold uppercase tracking-wide text-gray-400">
          {t("landing.howItWorksTitle")}
        </Text>
        <View className="mt-4 flex-row justify-between">
          {HOW_IT_WORKS.map((step) => (
            <View key={step.titleKey} className="flex-1 items-center px-1">
              <View className="h-9 w-9 items-center justify-center rounded-full bg-orange-50">
                <Ionicons name={step.icon} size={16} color="#ea580c" />
              </View>
              <Text className="mt-1.5 text-center text-xs font-medium text-gray-700">{t(step.titleKey)}</Text>
            </View>
          ))}
        </View>
      </View>

      <View className="mt-5 flex-row justify-between">
        {ROLE_ICONS.map((role) => (
          <View key={role.titleKey} className="flex-1 items-center px-1">
            <Ionicons name={role.icon} size={18} color="#334155" />
            <Text className="mt-1.5 text-center text-xs font-medium text-gray-700">{t(role.titleKey)}</Text>
          </View>
        ))}
      </View>

      <View className="mt-6 border-t border-gray-100 pt-6">
        {/* Wrapped in a plain centered View rather than putting alignSelf:
            center directly on the flex-row TouchableOpacity — a known
            Android Yoga layout quirk can freeze that row's height from an
            early single-line measurement pass, clipping a wrapped second
            word ("map" disappearing, leaving just "View"). Centering via the
            parent's alignItems instead avoids that measurement path. */}
        <View className="items-center">
          <TouchableOpacity
            onPress={() => setShowMap((v) => !v)}
            className="flex-row items-center rounded-full border border-orange-200 bg-orange-50 px-4 py-2"
            style={{ gap: 6 }}
          >
            <Ionicons name="map-outline" size={16} color="#c2410c" />
            <Text className="text-sm font-medium text-orange-700" numberOfLines={1}>
              {showMap ? t("landing.hideMap") : t("landing.viewMap")}
            </Text>
          </TouchableOpacity>
        </View>

        {showMap && (
          <View className="mt-4">
            <AreaSeverityMap height={340} />
          </View>
        )}
      </View>

      <Modal visible={welcomeVisible} transparent animationType="fade" onRequestClose={() => setWelcomeVisible(false)}>
        <View className="flex-1 items-center justify-center bg-black/50 px-6" accessibilityViewIsModal>
          {/* importantForAccessibility="no": a screen-reader user swiping
              through elements could otherwise land on this full-screen
              backdrop and double-tap it by accident, dismissing the dialog —
              the explicit ✕ button below and Android's back gesture are
              already the real accessible way to close this, so this
              tap-outside convenience (a sighted/touch-only affordance) is
              excluded from the accessibility tree entirely rather than left
              as an unlabeled, easy-to-mis-hit node. */}
          <TouchableOpacity
            className="absolute inset-0"
            activeOpacity={1}
            onPress={() => setWelcomeVisible(false)}
            importantForAccessibility="no"
            accessibilityElementsHidden
          />
          <View className="w-full max-w-sm rounded-2xl bg-white p-6">
            <View className="flex-row items-start justify-between">
              <View className="flex-1 pr-4">
                <Text className="text-xl font-bold text-gray-900">{t("common.welcomeModalTitle")}</Text>
                <Text className="mt-1 text-sm text-gray-600">{t("common.welcomeModalSubtitle")}</Text>
              </View>
              <TouchableOpacity
                onPress={() => setWelcomeVisible(false)}
                accessibilityLabel={t("common.close")}
                className="h-8 w-8 items-center justify-center rounded-full bg-gray-100"
              >
                <Ionicons name="close" size={18} color="#334155" />
              </TouchableOpacity>
            </View>

            <TouchableOpacity
              onPress={() => goTo("Register")}
              accessibilityRole="button"
              className="mt-6 items-center rounded bg-orange-600 py-3"
            >
              <Text className="font-medium text-white">{t("common.getStarted")}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => goTo("Login")}
              accessibilityRole="button"
              className="mt-3 items-center rounded border border-gray-300 py-3"
            >
              <Text className="text-sm font-medium text-slate-700">{t("common.signIn")}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}
