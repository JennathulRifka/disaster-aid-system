import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ChevronDown, ChevronUp } from "lucide-react";

/**
 * Always shows a short, plain-language `summary` first; the technical
 * methodology/sourcing text (`details`) is collapsed behind a "How is this
 * calculated?" toggle. Built for the public map's jargon-heavy captions
 * (acronyms, model internals, source citations) — appropriate detail for a
 * dissertation examiner, wrong as the FIRST thing a general visitor sees.
 */
export function InfoDisclosure({ summary, details }: { summary: string; details: string }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);

  return (
    <div className="mb-3">
      <p className="text-xs text-gray-600">{summary}</p>
      <button
        onClick={() => setOpen((o) => !o)}
        className="mt-1 flex items-center gap-1 text-xs font-medium text-orange-700 hover:underline"
      >
        {open ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
        {open ? t("common.hideDetails") : t("common.howCalculated")}
      </button>
      {open && <p className="mt-1 text-xs text-gray-400">{details}</p>}
    </div>
  );
}
