import { View, Text, TouchableOpacity } from "react-native";
import { useTranslation } from "react-i18next";
import { persistLanguage } from "../i18n";

const LANGUAGES = [
  { code: "en", label: "EN" },
  { code: "si", label: "සිං" },
  { code: "ta", label: "தமி" },
];

// Sinhala/Tamil strings are AI-translated best-effort, not native-reviewed —
// see src/i18n.ts. Fine for a demo, not yet production-grade.
export function LanguageSwitcher() {
  const { i18n } = useTranslation();

  function selectLanguage(code: string) {
    i18n.changeLanguage(code);
    persistLanguage(code);
  }

  return (
    <View className="flex-row items-center self-start rounded border border-gray-300 p-0.5">
      {LANGUAGES.map((lang) => (
        <TouchableOpacity
          key={lang.code}
          onPress={() => selectLanguage(lang.code)}
          className={`rounded px-2 py-1 ${i18n.resolvedLanguage === lang.code ? "bg-orange-600" : ""}`}
        >
          <Text
            className={`text-xs font-medium ${
              i18n.resolvedLanguage === lang.code ? "text-white" : "text-gray-600"
            }`}
          >
            {lang.label}
          </Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}
