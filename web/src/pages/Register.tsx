import { useState, type FormEvent } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { registerUser, type UserRole } from "@/lib/auth";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { normalizeSriLankanPhone } from "@/lib/phone";

export default function Register() {
  const { t } = useTranslation();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [phone, setPhone] = useState("");
  const [nic, setNic] = useState("");
  const [homeAddress, setHomeAddress] = useState("");
  const [role, setRole] = useState<UserRole>("victim");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");

    if (phone && !normalizeSriLankanPhone(phone)) {
      setError("Enter a valid Sri Lankan mobile number, e.g. 0771234567.");
      return;
    }

    setLoading(true);
    try {
      await registerUser({ email, password, name, role, phone, nic, homeAddress });
      navigate("/dashboard");
    } catch (err: any) {
      setError(err.message || "Registration failed.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-sm rounded-xl bg-white p-8 shadow">
        <div className="mb-4 flex items-center justify-between">
          <LanguageSwitcher />
          <Link
            to="/"
            aria-label={t("common.close")}
            className="flex h-8 w-8 items-center justify-center rounded-full text-gray-400 hover:bg-gray-100 hover:text-gray-600"
          >
            ✕
          </Link>
        </div>
        <h1 className="mb-6 text-2xl font-semibold text-gray-900">{t("auth.createAccountTitle")}</h1>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">{t("auth.fullName")}</label>
            <input
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded border border-gray-300 px-3 py-2 focus:border-blue-500 focus:outline-none"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">{t("auth.email")}</label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded border border-gray-300 px-3 py-2 focus:border-blue-500 focus:outline-none"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">{t("auth.password")}</label>
            <input
              type="password"
              required
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded border border-gray-300 px-3 py-2 focus:border-blue-500 focus:outline-none"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">{t("auth.phone")}</label>
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="0771234567"
              className="w-full rounded border border-gray-300 px-3 py-2 focus:border-blue-500 focus:outline-none"
            />
            <p className="mt-1 text-xs text-gray-400">Sri Lankan mobile number — used for SMS status alerts.</p>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">{t("auth.iAmA")}</label>
            <select
              value={role}
              onChange={(e) => setRole(e.target.value as UserRole)}
              className="w-full rounded border border-gray-300 px-3 py-2 focus:border-blue-500 focus:outline-none"
            >
              <option value="victim">{t("auth.roleVictim")}</option>
              <option value="donor">{t("auth.roleDonor")}</option>
              <option value="volunteer">{t("auth.roleVolunteer")}</option>
              <option value="admin">{t("auth.roleAdmin")}</option>
            </select>
          </div>

          {role === "victim" && (
            <>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">{t("auth.nic")}</label>
                <input
                  required
                  value={nic}
                  onChange={(e) => setNic(e.target.value)}
                  className="w-full rounded border border-gray-300 px-3 py-2 focus:border-blue-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">{t("auth.homeAddress")}</label>
                <input
                  required
                  value={homeAddress}
                  onChange={(e) => setHomeAddress(e.target.value)}
                  className="w-full rounded border border-gray-300 px-3 py-2 focus:border-blue-500 focus:outline-none"
                />
                <p className="mt-1 text-xs text-gray-400">{t("auth.homeAddressHint")}</p>
              </div>
            </>
          )}

          {error && <p className="text-sm text-red-600">{error}</p>}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded bg-orange-600 py-2 font-medium text-white hover:bg-orange-700 disabled:opacity-50"
          >
            {loading ? t("auth.creatingAccount") : t("auth.createAccountButton")}
          </button>
        </form>

        <p className="mt-4 text-center text-sm text-gray-600">
          {t("auth.alreadyHaveAccount")}{" "}
          <Link to="/login" className="text-slate-700 hover:underline">
            {t("auth.signInButton")}
          </Link>
        </p>
      </div>
    </div>
  );
}
