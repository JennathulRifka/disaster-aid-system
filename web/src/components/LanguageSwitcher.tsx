import { useTranslation } from "react-i18next";

const LANGUAGES = [
  { code: "en", label: "EN" },
  { code: "si", label: "සිං" },
  { code: "ta", label: "தமி" },
];

// Sinhala/Tamil strings are AI-translated best-effort, not native-reviewed —
// see src/i18n.ts. Fine for a demo, not yet production-grade.
export function LanguageSwitcher({ className = "" }: { className?: string }) {
  const { i18n } = useTranslation();

  return (
    <div className={`flex items-center gap-1 rounded border border-gray-300 p-0.5 text-xs ${className}`}>
      {LANGUAGES.map((lang) => (
        <button
          key={lang.code}
          onClick={() => i18n.changeLanguage(lang.code)}
          className={`rounded px-2 py-1 font-medium ${
            i18n.resolvedLanguage === lang.code
              ? "bg-orange-600 text-white"
              : "text-gray-600 hover:bg-gray-100"
          }`}
        >
          {lang.label}
        </button>
      ))}
    </div>
  );
}
