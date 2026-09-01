import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";

export function Footer() {
  const { t } = useTranslation();

  return (
    <footer className="border-t border-gray-200 bg-white">
      <div className="mx-auto max-w-5xl px-8 py-10">
        <div className="grid grid-cols-1 gap-8 sm:grid-cols-3">
          <div>
            <h4 className="font-semibold text-gray-900">{t("landing.brand")}</h4>
            <p className="mt-2 text-sm text-gray-500">{t("footer.tagline")}</p>
          </div>

          <div>
            <h4 className="text-sm font-semibold text-gray-900">{t("footer.platformHeading")}</h4>
            <ul className="mt-2 space-y-1.5 text-sm text-gray-500">
              <li>
                <Link to="/transparency" className="hover:text-slate-700 hover:underline">
                  {t("footer.linkTransparency")}
                </Link>
              </li>
              <li>
                <Link to="/severity-map" className="hover:text-slate-700 hover:underline">
                  {t("footer.linkSeverityMap")}
                </Link>
              </li>
              <li>
                <Link to="/register" className="hover:text-slate-700 hover:underline">
                  {t("footer.linkRequestOrGive")}
                </Link>
              </li>
            </ul>
          </div>

          <div>
            <h4 className="text-sm font-semibold text-gray-900">{t("footer.dataSourcesHeading")}</h4>
            <p className="mt-2 text-sm text-gray-500">{t("footer.dataSourcesText")}</p>
          </div>
        </div>

        <div className="mt-8 border-t border-gray-100 pt-6 text-xs text-gray-400">
          {t("footer.disclaimer")}
        </div>
      </div>
    </footer>
  );
}
