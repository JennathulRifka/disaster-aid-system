import { useState, type FormEvent } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { loginUser } from "@/lib/auth";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";

export default function Login() {
  const { t } = useTranslation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await loginUser(email, password);
      navigate("/dashboard");
    } catch (err: any) {
      setError(err.message || t("auth.loginFailed", "Login failed. Check your email and password."));
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
        <h1 className="mb-6 text-2xl font-semibold text-gray-900">{t("auth.signInTitle")}</h1>

        <form onSubmit={handleSubmit} className="space-y-4">
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
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded border border-gray-300 px-3 py-2 focus:border-blue-500 focus:outline-none"
            />
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded bg-orange-600 py-2 font-medium text-white hover:bg-orange-700 disabled:opacity-50"
          >
            {loading ? t("auth.signingIn") : t("auth.signInButton")}
          </button>
        </form>

        <p className="mt-4 text-center text-sm text-gray-600">
          {t("auth.noAccount")}{" "}
          <Link to="/register" className="text-slate-700 hover:underline">
            {t("auth.register")}
          </Link>
        </p>
      </div>
    </div>
  );
}
