import { useState } from "react";
import { useTranslation } from "react-i18next";
import { X } from "lucide-react";

const STEPS = [
  { titleKey: "mapWalkthrough.step1Title", bodyKey: "mapWalkthrough.step1Body" },
  { titleKey: "mapWalkthrough.step2Title", bodyKey: "mapWalkthrough.step2Body" },
  { titleKey: "mapWalkthrough.step3Title", bodyKey: "mapWalkthrough.step3Body" },
];

/**
 * A 3-step onboarding modal for the public map — deliberately a centered
 * modal carousel rather than a spotlight tooltip pointing at specific map
 * controls: spotlight positioning is fragile across viewport sizes and tab
 * states, while a modal works identically everywhere and needs no per-element
 * coordinate math. Shown once automatically (see useMapWalkthrough), and
 * reopenable any time from the accessibility control's "Help / Tour" button.
 * z-[1200]: same fix as every other overlay on a Leaflet-map page in this
 * app — above Leaflet's own panes/controls (raw z-index up to 1000).
 */
export function MapWalkthroughModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useTranslation();
  const [step, setStep] = useState(0);

  if (!open) return null;

  const isLast = step === STEPS.length - 1;
  const current = STEPS[step];

  function close() {
    setStep(0);
    onClose();
  }

  return (
    <div className="fixed inset-0 z-[1200] flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-sm rounded-xl bg-white p-6 shadow-xl">
        <div className="flex items-start justify-between">
          <p className="text-xs font-medium uppercase tracking-wide text-orange-600">
            {t("mapWalkthrough.stepCounter", { current: step + 1, total: STEPS.length })}
          </p>
          <button onClick={close} aria-label={t("common.close")} className="text-gray-400 hover:text-gray-600">
            <X size={18} />
          </button>
        </div>
        <h3 className="mt-2 text-lg font-semibold text-gray-900">{t(current.titleKey)}</h3>
        <p className="mt-2 text-sm text-gray-600">{t(current.bodyKey)}</p>
        <div className="mt-5 flex items-center justify-between">
          <button onClick={close} className="text-sm text-gray-500 hover:underline">
            {t("common.skip")}
          </button>
          <button
            onClick={() => (isLast ? close() : setStep((s) => s + 1))}
            className="rounded bg-orange-600 px-4 py-2 text-sm font-medium text-white hover:bg-orange-700"
          >
            {isLast ? t("common.gotIt") : t("common.next")}
          </button>
        </div>
      </div>
    </div>
  );
}
