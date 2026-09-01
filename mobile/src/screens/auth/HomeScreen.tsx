import { useEffect, useState } from "react";
import { View, Text, ScrollView, TouchableOpacity, ActivityIndicator } from "react-native";
import { useTranslation } from "react-i18next";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { AuthStackParamList } from "../../navigation/types";
import { LanguageSwitcher } from "../../components/LanguageSwitcher";
import { StatCard } from "../../components/StatCard";
import { apiFetch } from "../../lib/api";

type Props = NativeStackScreenProps<AuthStackParamList, "Home">;

interface Stats {
  totalRequests: number;
  completedDeliveries: number;
  totalVolunteers: number;
  districtsReached: number;
}

// The public landing experience for logged-out users — mirrors web's
// Landing.tsx (hero + live stats), scoped down for a phone screen. Before
// this screen existed, RootNavigator sent every logged-out user straight to
// LoginScreen with zero context about what the app is, unlike web where
// Landing.tsx is the actual entry point and Login/Register are one tap away
// from it, not the front door itself.
export function HomeScreen({ navigation }: Props) {
  const { t } = useTranslation();
  const [stats, setStats] = useState<Stats | null>(null);

  useEffect(() => {
    apiFetch("/api/stats")
      .then(setStats)
      .catch(() => setStats(null));
  }, []);

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

      <TouchableOpacity
        onPress={() => navigation.navigate("Register")}
        className="mt-8 items-center rounded bg-orange-600 py-3"
      >
        <Text className="font-medium text-white">{t("common.getStarted")}</Text>
      </TouchableOpacity>

      <TouchableOpacity onPress={() => navigation.navigate("Login")} className="mt-3 items-center py-2">
        <Text className="text-sm font-medium text-slate-700">{t("common.signIn")}</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}
