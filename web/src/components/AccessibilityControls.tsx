import { useState } from "react";
import { useTranslation } from "react-i18next";
import { HelpCircle } from "lucide-react";
import { getFontScale, setFontScale, getHighContrast, setHighContrast, type FontScale } from "@/lib/accessibility";

const SCALE_LABEL: Record<FontScale, string> = { normal: "A", large: "A+", xlarge: "A++" };

/**
 * A small "Aa" control offering text-size and high-contrast toggles, plus a
 * shortcut back into the map walkthrough. Deliberately only mounted on the
 * two public map surfaces (Landing, PublicSeverityMap) — that's the specific
 * "not user-friendly for all knowledge levels" feedback this addresses — but
 * the underlying effect (see src/lib/accessibility.ts) applies app-wide and
 * persists across navigation, since an accessibility preference shouldn't
 * reset just because the user moved to another page.
 */
export function AccessibilityControls({ onShowHelp }: { onShowHelp?: () => void }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [scale, setScaleState] = useState<FontScale>(getFontScale());
  const [contrast, setContrastState] = useState(getHighContrast());

  function applyScale(s: FontScale) {
    setFontScale(s);
    setScaleState(s);
  }

  function toggleContrast() {
    const next = !contrast;
    setHighContrast(next);
    setContrastState(next);
  }

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-label={t("common.accessibilityOptions")}
        className="flex h-9 w-9 items-center justify-center rounded-full border border-gray-300 bg-white text-sm font-semibold text-gray-700 shadow-sm hover:bg-gray-50"
      >
        Aa
      </button>
      {open && (
        <div className="absolute right-0 z-[1200] mt-2 w-56 rounded-lg border border-gray-200 bg-white p-3 shadow-lg">
          <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-gray-500">
            {t("common.textSize")}
          </p>
          <div className="flex gap-2">
            {(Object.keys(SCALE_LABEL) as FontScale[]).map((s) => (
              <button
                key={s}
                onClick={() => applyScale(s)}
                className={`flex-1 rounded border px-2 py-1 text-xs font-medium ${
                  scale === s
                    ? "border-orange-600 bg-orange-50 text-orange-700"
                    : "border-gray-300 text-gray-600 hover:bg-gray-50"
                }`}
              >
                {SCALE_LABEL[s]}
              </button>
            ))}
          </div>
          <label className="mt-3 flex items-center justify-between text-xs text-gray-700">
            {t("common.highContrast")}
            <input type="checkbox" checked={contrast} onChange={toggleContrast} />
          </label>
          {onShowHelp && (
            <button
              onClick={() => {
                setOpen(false);
                onShowHelp();
              }}
              className="mt-3 flex w-full items-center justify-center gap-1.5 rounded border border-gray-300 px-2 py-1.5 text-xs text-gray-600 hover:bg-gray-50"
            >
              <HelpCircle size={14} />
              {t("common.helpTour")}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
