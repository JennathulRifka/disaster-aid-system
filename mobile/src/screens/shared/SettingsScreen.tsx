import { useEffect, useState } from "react";
import { View, Text, TextInput, TouchableOpacity, ScrollView } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import * as Location from "expo-location";
import { useAuth } from "../../context/AuthContext";
import { logoutUser } from "../../lib/auth";
import { apiFetch } from "../../lib/api";
import {
  requestAndRegisterPushToken,
  getNotificationPermissionState,
  openNotificationSettings,
} from "../../lib/notifications";
import { normalizeSriLankanPhone } from "../../lib/phone";
import { LanguageSwitcher } from "../../components/LanguageSwitcher";

type PermissionState = "granted" | "denied" | "undetermined" | "unsupported";

// One collapsed-by-default accordion row — the direct fix for "feels like
// everything is together, too much info to process": every section used to
// render fully open at once (profile form + language + notifications +
// account all visible simultaneously), which is a wall of controls on a
// phone screen even though each individual section is short. Tapping a
// header toggles just that section; nothing else moves.
function SettingsSection({
  icon,
  title,
  subtitle,
  open,
  onToggle,
  children,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  subtitle?: string;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <View className="rounded-xl border border-gray-200 bg-white">
      <TouchableOpacity
        onPress={onToggle}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        className="flex-row items-center justify-between p-4"
      >
        <View className="flex-1 flex-row items-center" style={{ gap: 10 }}>
          <View className="h-8 w-8 items-center justify-center rounded-full bg-orange-50">
            <Ionicons name={icon} size={16} color="#ea580c" />
          </View>
          <View className="flex-1">
            <Text className="text-sm font-semibold text-gray-900">{title}</Text>
            {subtitle && !open && (
              <Text className="mt-0.5 text-xs text-gray-500" numberOfLines={1}>
                {subtitle}
              </Text>
            )}
          </View>
        </View>
        <Ionicons name={open ? "chevron-up" : "chevron-down"} size={18} color="#9ca3af" />
      </TouchableOpacity>
      {open && <View className="border-t border-gray-100 p-4 pt-3">{children}</View>}
    </View>
  );
}

// Shared across every role's tab bar (a real bottom tab for victim/donor/
// volunteer, and one of admin's promoted tabs too — see AdminTabs.tsx).
// Mirrors web's Settings.tsx: edit my own name/phone, switch language,
// enable push notifications, log out — plus a volunteer-only section for
// the availability/location toggles moved here from MyDeliveriesScreen
// (direct user ask: those pills were cluttering a page whose real job is
// tracking deliveries, and this is a "set once, rarely revisit" preference
// exactly like everything else on this screen).
export function SettingsScreen() {
  const { t } = useTranslation();
  const { profile, refreshProfile } = useAuth();
  const [openSection, setOpenSection] = useState<string | null>("profile");
  const [name, setName] = useState(profile?.name || "");
  const [phone, setPhone] = useState(profile?.phone || "");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");
  const [permission, setPermission] = useState<PermissionState>("undetermined");
  const [canAskAgain, setCanAskAgain] = useState(true);
  const [enabling, setEnabling] = useState(false);

  const isVolunteer = profile?.role === "volunteer";
  const [available, setAvailable] = useState<boolean | null>(null);
  const [savingAvailability, setSavingAvailability] = useState(false);
  const [myLocation, setMyLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [locationStatus, setLocationStatus] = useState<"idle" | "capturing" | "error">("idle");

  function toggleSection(key: string) {
    setOpenSection((prev) => (prev === key ? null : key));
  }

  async function checkPermission() {
    const { status, canAskAgain: askAgain } = await getNotificationPermissionState();
    setPermission(status as PermissionState);
    setCanAskAgain(askAgain);
  }

  useEffect(() => {
    checkPermission();
  }, []);

  useEffect(() => {
    if (!isVolunteer) return;
    apiFetch("/api/users/me").then((me) => {
      setAvailable(me.available !== false);
      setMyLocation(me.location || null);
    });
  }, [isVolunteer]);

  async function handleSave() {
    setError("");
    setSaved(false);
    if (phone && !normalizeSriLankanPhone(phone)) {
      setError(t("settings.invalidPhone"));
      return;
    }
    setSaving(true);
    try {
      await apiFetch("/api/users/profile", { method: "PATCH", body: JSON.stringify({ name, phone }) });
      await refreshProfile();
      setSaved(true);
    } catch (err: any) {
      setError(err.message || t("settings.saveFailed"));
    } finally {
      setSaving(false);
    }
  }

  async function handleEnableNotifications() {
    setEnabling(true);
    try {
      const result = await requestAndRegisterPushToken();
      setPermission(result === "granted" ? "granted" : result === "unsupported" ? "unsupported" : "denied");
      await checkPermission();
    } finally {
      setEnabling(false);
    }
  }

  async function toggleAvailability() {
    if (available === null) return;
    const next = !available;
    setSavingAvailability(true);
    try {
      await apiFetch("/api/users/availability", { method: "PATCH", body: JSON.stringify({ available: next }) });
      setAvailable(next);
    } finally {
      setSavingAvailability(false);
    }
  }

  async function updateMyLocation() {
    setLocationStatus("capturing");
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== "granted") {
      setLocationStatus("error");
      return;
    }
    try {
      const pos = await Location.getCurrentPositionAsync({});
      const location = { lat: pos.coords.latitude, lng: pos.coords.longitude };
      await apiFetch("/api/users/location", { method: "PATCH", body: JSON.stringify({ location }) });
      setMyLocation(location);
      setLocationStatus("idle");
    } catch {
      setLocationStatus("error");
    }
  }

  const roleLabel = profile?.role
    ? t(`auth.role${profile.role.charAt(0).toUpperCase()}${profile.role.slice(1)}`, profile.role)
    : "";

  const notificationsSummary =
    permission === "granted"
      ? t("settings.notificationsEnabled")
      : permission === "unsupported"
        ? t("settings.notificationsUnsupported")
        : t("settings.notificationsHint");

  return (
    <ScrollView className="flex-1 bg-gray-50" contentContainerStyle={{ padding: 16 }}>
      <Text className="text-2xl font-semibold text-gray-900">{t("settings.title")}</Text>

      <View className="mt-6" style={{ gap: 10 }}>
        <SettingsSection
          icon="person-outline"
          title={t("settings.profileSection")}
          subtitle={profile?.email}
          open={openSection === "profile"}
          onToggle={() => toggleSection("profile")}
        >
          <View style={{ gap: 12 }}>
            <View>
              <Text className="mb-1 text-sm font-medium text-gray-700">{t("settings.email")}</Text>
              <TextInput
                value={profile?.email || ""}
                editable={false}
                accessibilityLabel={t("settings.email")}
                className="rounded border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-500"
              />
            </View>
            <View>
              <Text className="mb-1 text-sm font-medium text-gray-700">{t("settings.fullName")}</Text>
              <TextInput
                value={name}
                onChangeText={setName}
                accessibilityLabel={t("settings.fullName")}
                className="rounded border border-gray-300 px-3 py-2 text-sm"
              />
            </View>
            <View>
              <Text className="mb-1 text-sm font-medium text-gray-700">{t("settings.phone")}</Text>
              <TextInput
                value={phone}
                onChangeText={setPhone}
                keyboardType="phone-pad"
                placeholder="0771234567"
                accessibilityLabel={t("settings.phone")}
                className="rounded border border-gray-300 px-3 py-2 text-sm"
              />
            </View>

            {error ? <Text className="text-sm text-red-600">{error}</Text> : null}
            {saved ? <Text className="text-sm text-green-700">{t("settings.saved")}</Text> : null}

            <TouchableOpacity
              onPress={handleSave}
              disabled={saving}
              accessibilityRole="button"
              accessibilityState={{ disabled: saving }}
              className="items-center rounded bg-orange-600 py-2.5"
              style={{ opacity: saving ? 0.5 : 1 }}
            >
              <Text className="text-sm font-medium text-white">
                {saving ? t("settings.saving") : t("settings.saveChanges")}
              </Text>
            </TouchableOpacity>
          </View>
        </SettingsSection>

        {isVolunteer && (
          <SettingsSection
            icon="car-outline"
            title={t("volunteerDeliveries.availabilitySection", "Availability")}
            subtitle={
              available === null
                ? undefined
                : available
                  ? t("volunteerDeliveries.availableForDeliveries")
                  : t("volunteerDeliveries.unavailable")
            }
            open={openSection === "availability"}
            onToggle={() => toggleSection("availability")}
          >
            <View style={{ gap: 10 }}>
              <TouchableOpacity
                onPress={updateMyLocation}
                disabled={locationStatus === "capturing"}
                accessibilityRole="button"
                className={`flex-row items-center self-start rounded-full border px-3 py-1.5 ${
                  myLocation ? "border-green-200 bg-green-50" : "border-amber-200 bg-amber-50"
                }`}
                style={{ gap: 6, opacity: locationStatus === "capturing" ? 0.5 : 1 }}
              >
                <View className={`h-2 w-2 rounded-full ${myLocation ? "bg-green-500" : "bg-amber-500"}`} />
                <Text className={`text-sm font-medium ${myLocation ? "text-green-700" : "text-amber-700"}`}>
                  {locationStatus === "capturing"
                    ? t("volunteerDeliveries.locating")
                    : myLocation
                      ? t("volunteerDeliveries.locationSetUpdate")
                      : t("volunteerDeliveries.setMyLocation")}
                </Text>
              </TouchableOpacity>
              {locationStatus === "error" && (
                <Text className="text-xs text-red-600">{t("volunteerDeliveries.locationErrorPermissions")}</Text>
              )}
              {!myLocation && (
                <Text className="text-xs text-amber-700">{t("volunteerDeliveries.setLocationHint")}</Text>
              )}

              {available !== null && (
                <TouchableOpacity
                  onPress={toggleAvailability}
                  disabled={savingAvailability}
                  accessibilityRole="button"
                  className={`flex-row items-center self-start rounded-full border px-3 py-1.5 ${
                    available ? "border-green-200 bg-green-50" : "border-gray-300 bg-gray-100"
                  }`}
                  style={{ gap: 6, opacity: savingAvailability ? 0.5 : 1 }}
                >
                  <View className={`h-2 w-2 rounded-full ${available ? "bg-green-500" : "bg-gray-400"}`} />
                  <Text className={`text-sm font-medium ${available ? "text-green-700" : "text-gray-600"}`}>
                    {available ? t("volunteerDeliveries.availableForDeliveries") : t("volunteerDeliveries.unavailable")}
                  </Text>
                </TouchableOpacity>
              )}
            </View>
          </SettingsSection>
        )}

        <SettingsSection
          icon="language-outline"
          title={t("settings.languageSection")}
          open={openSection === "language"}
          onToggle={() => toggleSection("language")}
        >
          <Text className="mb-3 text-xs text-gray-500">{t("settings.languageHint")}</Text>
          <LanguageSwitcher />
        </SettingsSection>

        <SettingsSection
          icon="notifications-outline"
          title={t("settings.notificationsSection")}
          subtitle={notificationsSummary}
          open={openSection === "notifications"}
          onToggle={() => toggleSection("notifications")}
        >
          {permission === "unsupported" && (
            <Text className="text-sm text-gray-500">{t("settings.notificationsUnsupported")}</Text>
          )}
          {permission === "granted" && <Text className="text-sm text-green-700">{t("settings.notificationsEnabled")}</Text>}
          {permission === "denied" && canAskAgain && (
            <>
              <Text className="text-xs text-gray-500">{t("settings.notificationsHint")}</Text>
              <TouchableOpacity
                onPress={handleEnableNotifications}
                disabled={enabling}
                accessibilityRole="button"
                className="mt-3 items-center rounded bg-orange-600 py-2.5"
                style={{ opacity: enabling ? 0.5 : 1 }}
              >
                <Text className="text-sm font-medium text-white">
                  {enabling ? t("settings.enabling") : t("settings.enableNotifications")}
                </Text>
              </TouchableOpacity>
            </>
          )}
          {permission === "denied" && !canAskAgain && (
            <>
              <Text className="text-sm text-amber-700">{t("settings.notificationsBlocked")}</Text>
              <TouchableOpacity
                onPress={openNotificationSettings}
                accessibilityRole="button"
                className="mt-3 items-center rounded border border-orange-300 bg-orange-50 py-2.5"
              >
                <Text className="text-sm font-medium text-orange-700">{t("settings.openNotificationSettings")}</Text>
              </TouchableOpacity>
            </>
          )}
          {permission === "undetermined" && (
            <>
              <Text className="text-xs text-gray-500">{t("settings.notificationsHint")}</Text>
              <TouchableOpacity
                onPress={handleEnableNotifications}
                disabled={enabling}
                accessibilityRole="button"
                className="mt-3 items-center rounded bg-orange-600 py-2.5"
                style={{ opacity: enabling ? 0.5 : 1 }}
              >
                <Text className="text-sm font-medium text-white">
                  {enabling ? t("settings.enabling") : t("settings.enableNotifications")}
                </Text>
              </TouchableOpacity>
            </>
          )}
        </SettingsSection>

        <SettingsSection
          icon="log-out-outline"
          title={t("settings.accountSection")}
          subtitle={roleLabel}
          open={openSection === "account"}
          onToggle={() => toggleSection("account")}
        >
          <Text className="mb-3 text-xs text-gray-500">
            {t("settings.role")}: {roleLabel}
          </Text>
          <TouchableOpacity
            onPress={() => logoutUser()}
            accessibilityRole="button"
            className="items-center rounded border border-gray-300 py-2.5"
          >
            <Text className="text-sm font-medium text-gray-700">{t("common.logOut")}</Text>
          </TouchableOpacity>
        </SettingsSection>
      </View>
    </ScrollView>
  );
}
