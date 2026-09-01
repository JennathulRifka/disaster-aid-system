import { useEffect, useState } from "react";
import { View, Text, TextInput, TouchableOpacity, ScrollView } from "react-native";
import { useTranslation } from "react-i18next";
import * as Notifications from "expo-notifications";
import { useAuth } from "../../context/AuthContext";
import { logoutUser } from "../../lib/auth";
import { apiFetch } from "../../lib/api";
import { requestAndRegisterPushToken } from "../../lib/notifications";
import { normalizeSriLankanPhone } from "../../lib/phone";
import { LanguageSwitcher } from "../../components/LanguageSwitcher";

type PermissionState = "granted" | "denied" | "undetermined" | "unsupported";

// Shared across every role's tab bar (victim/donor/volunteer get it as a 4th
// tab; admin gets it inside AdminMoreStack — see the Settings entry there and
// CLAUDE.md's "Settings page" section). Mirrors web's Settings.tsx: edit my
// own name/phone, switch language, enable push notifications, log out.
export function SettingsScreen() {
  const { t } = useTranslation();
  const { profile, refreshProfile } = useAuth();
  const [name, setName] = useState(profile?.name || "");
  const [phone, setPhone] = useState(profile?.phone || "");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");
  const [permission, setPermission] = useState<PermissionState>("undetermined");
  const [enabling, setEnabling] = useState(false);

  async function checkPermission() {
    try {
      const { status } = await Notifications.getPermissionsAsync();
      setPermission(status as PermissionState);
    } catch {
      setPermission("unsupported");
    }
  }

  useEffect(() => {
    checkPermission();
  }, []);

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
    } finally {
      setEnabling(false);
    }
  }

  const roleLabel = profile?.role
    ? t(`auth.role${profile.role.charAt(0).toUpperCase()}${profile.role.slice(1)}`, profile.role)
    : "";

  return (
    <ScrollView className="flex-1 bg-gray-50" contentContainerStyle={{ padding: 16 }}>
      <Text className="text-2xl font-semibold text-gray-900">{t("settings.title")}</Text>

      <View className="mt-6" style={{ gap: 16 }}>
        <View className="rounded-xl border border-gray-200 bg-white p-4">
          <Text className="text-sm font-semibold text-gray-900">{t("settings.profileSection")}</Text>
          <View className="mt-3" style={{ gap: 12 }}>
            <View>
              <Text className="mb-1 text-sm font-medium text-gray-700">{t("settings.email")}</Text>
              <TextInput
                value={profile?.email || ""}
                editable={false}
                className="rounded border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-500"
              />
            </View>
            <View>
              <Text className="mb-1 text-sm font-medium text-gray-700">{t("settings.fullName")}</Text>
              <TextInput
                value={name}
                onChangeText={setName}
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
                className="rounded border border-gray-300 px-3 py-2 text-sm"
              />
            </View>

            {error ? <Text className="text-sm text-red-600">{error}</Text> : null}
            {saved ? <Text className="text-sm text-green-700">{t("settings.saved")}</Text> : null}

            <TouchableOpacity
              onPress={handleSave}
              disabled={saving}
              className="items-center rounded bg-orange-600 py-2.5"
              style={{ opacity: saving ? 0.5 : 1 }}
            >
              <Text className="text-sm font-medium text-white">
                {saving ? t("settings.saving") : t("settings.saveChanges")}
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        <View className="rounded-xl border border-gray-200 bg-white p-4">
          <Text className="text-sm font-semibold text-gray-900">{t("settings.languageSection")}</Text>
          <Text className="mt-1 text-xs text-gray-500">{t("settings.languageHint")}</Text>
          <View className="mt-3">
            <LanguageSwitcher />
          </View>
        </View>

        <View className="rounded-xl border border-gray-200 bg-white p-4">
          <Text className="text-sm font-semibold text-gray-900">{t("settings.notificationsSection")}</Text>
          {permission === "unsupported" && (
            <Text className="mt-2 text-sm text-gray-500">{t("settings.notificationsUnsupported")}</Text>
          )}
          {permission === "granted" && (
            <Text className="mt-2 text-sm text-green-700">{t("settings.notificationsEnabled")}</Text>
          )}
          {permission === "denied" && (
            <Text className="mt-2 text-sm text-amber-700">{t("settings.notificationsBlocked")}</Text>
          )}
          {permission === "undetermined" && (
            <>
              <Text className="mt-1 text-xs text-gray-500">{t("settings.notificationsHint")}</Text>
              <TouchableOpacity
                onPress={handleEnableNotifications}
                disabled={enabling}
                className="mt-3 items-center rounded bg-orange-600 py-2.5"
                style={{ opacity: enabling ? 0.5 : 1 }}
              >
                <Text className="text-sm font-medium text-white">
                  {enabling ? t("settings.enabling") : t("settings.enableNotifications")}
                </Text>
              </TouchableOpacity>
            </>
          )}
        </View>

        <View className="rounded-xl border border-gray-200 bg-white p-4">
          <Text className="text-sm font-semibold text-gray-900">{t("settings.accountSection")}</Text>
          <Text className="mt-1 text-xs text-gray-500">
            {t("settings.role")}: {roleLabel}
          </Text>
          <TouchableOpacity
            onPress={() => logoutUser()}
            className="mt-3 items-center rounded border border-gray-300 py-2.5"
          >
            <Text className="text-sm font-medium text-gray-700">{t("common.logOut")}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </ScrollView>
  );
}
