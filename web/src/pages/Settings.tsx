import { useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { DashboardLayout } from "@/components/DashboardLayout";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { useAuth } from "@/context/AuthContext";
import { logoutUser } from "@/lib/auth";
import { apiFetch } from "@/lib/api";
import { requestAndRegisterFcmToken } from "@/lib/notifications";
import { normalizeSriLankanPhone } from "@/lib/phone";

export default function Settings() {
  const { t } = useTranslation();
  const { profile, refreshProfile } = useAuth();
  const [name, setName] = useState(profile?.name || "");
  const [phone, setPhone] = useState(profile?.phone || "");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  const [permission, setPermission] = useState<NotificationPermission | "unsupported">(
    typeof Notification === "undefined" ? "unsupported" : Notification.permission
  );
  const [enablingNotifications, setEnablingNotifications] = useState(false);

  async function handleSaveProfile(e: FormEvent) {
    e.preventDefault();
    setError("");
    setSaved(false);

    if (phone && !normalizeSriLankanPhone(phone)) {
      setError(t("settings.invalidPhone"));
      return;
    }

    setSaving(true);
    try {
      await apiFetch("/api/users/profile", {
        method: "PATCH",
        body: JSON.stringify({ name, phone }),
      });
      await refreshProfile();
      setSaved(true);
    } catch (err: any) {
      setError(err.message || t("settings.saveFailed"));
    } finally {
      setSaving(false);
    }
  }

  async function handleEnableNotifications() {
    setEnablingNotifications(true);
    try {
      const result = await requestAndRegisterFcmToken();
      setPermission(result === "unsupported" ? "unsupported" : result === "granted" ? "granted" : "denied");
    } finally {
      setEnablingNotifications(false);
    }
  }

  return (
    <DashboardLayout>
      <h1 className="text-2xl font-semibold text-gray-900">{t("settings.title")}</h1>

      <div className="mt-6 max-w-xl space-y-6">
        <section className="rounded-xl border border-gray-200 bg-white p-6">
          <h2 className="text-sm font-semibold text-gray-900">{t("settings.profileSection")}</h2>
          <form onSubmit={handleSaveProfile} className="mt-4 space-y-4">
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">{t("settings.email")}</label>
              <input
                value={profile?.email || ""}
                disabled
                className="w-full rounded border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-500"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">{t("settings.fullName")}</label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">{t("settings.phone")}</label>
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="0771234567"
                className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
              />
            </div>

            {error && <p className="text-sm text-red-600">{error}</p>}
            {saved && <p className="text-sm text-green-700">{t("settings.saved")}</p>}

            <button
              type="submit"
              disabled={saving}
              className="rounded bg-orange-600 px-4 py-2 text-sm font-medium text-white hover:bg-orange-700 disabled:opacity-50"
            >
              {saving ? t("settings.saving") : t("settings.saveChanges")}
            </button>
          </form>
        </section>

        <section className="rounded-xl border border-gray-200 bg-white p-6">
          <h2 className="text-sm font-semibold text-gray-900">{t("settings.languageSection")}</h2>
          <p className="mt-1 text-xs text-gray-500">{t("settings.languageHint")}</p>
          <LanguageSwitcher className="mt-3" />
        </section>

        <section className="rounded-xl border border-gray-200 bg-white p-6">
          <h2 className="text-sm font-semibold text-gray-900">{t("settings.notificationsSection")}</h2>
          {permission === "unsupported" && (
            <p className="mt-2 text-sm text-gray-500">{t("settings.notificationsUnsupported")}</p>
          )}
          {permission === "granted" && (
            <p className="mt-2 text-sm text-green-700">{t("settings.notificationsEnabled")}</p>
          )}
          {permission === "denied" && (
            <p className="mt-2 text-sm text-amber-700">{t("settings.notificationsBlocked")}</p>
          )}
          {permission === "default" && (
            <>
              <p className="mt-1 text-xs text-gray-500">{t("settings.notificationsHint")}</p>
              <button
                onClick={handleEnableNotifications}
                disabled={enablingNotifications}
                className="mt-3 rounded bg-orange-600 px-4 py-2 text-sm font-medium text-white hover:bg-orange-700 disabled:opacity-50"
              >
                {enablingNotifications ? t("settings.enabling") : t("settings.enableNotifications")}
              </button>
            </>
          )}
        </section>

        <section className="rounded-xl border border-gray-200 bg-white p-6">
          <h2 className="text-sm font-semibold text-gray-900">{t("settings.accountSection")}</h2>
          <p className="mt-1 text-xs text-gray-500">
            {t("settings.role")}:{" "}
            {profile?.role &&
              t(`auth.role${profile.role.charAt(0).toUpperCase()}${profile.role.slice(1)}`, profile.role)}
          </p>
          <button
            onClick={() => logoutUser()}
            className="mt-3 rounded border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            {t("common.logOut")}
          </button>
        </section>
      </div>
    </DashboardLayout>
  );
}
