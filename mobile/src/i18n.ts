// Sinhala and Tamil strings here are AI-generated best-effort translations,
// NOT reviewed by a native speaker. Fine for a dissertation demo of the
// capability; get them checked by a native Sinhala/Tamil speaker before any
// real deployment — mistranslation in a disaster-relief context is a real
// harm, not just a polish issue. Same locale files as web/src/locales
// (copied, not shared — separate projects), same caveat noted there.
import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import * as Localization from "expo-localization";
import AsyncStorage from "@react-native-async-storage/async-storage";

import en from "./locales/en.json";
import si from "./locales/si.json";
import ta from "./locales/ta.json";

const SUPPORTED_LANGUAGES = ["en", "si", "ta"];
const STORAGE_KEY = "i18nextLng";

function detectDeviceLanguage(): string {
  const deviceCode = Localization.getLocales()[0]?.languageCode || "en";
  return SUPPORTED_LANGUAGES.includes(deviceCode) ? deviceCode : "en";
}

i18n.use(initReactI18next).init({
  resources: {
    en: { translation: en },
    si: { translation: si },
    ta: { translation: ta },
  },
  lng: detectDeviceLanguage(),
  fallbackLng: "en",
  interpolation: { escapeValue: false },
});

// i18next-browser-languagedetector (web's detector) reads/writes
// localStorage synchronously — no RN equivalent exists, since AsyncStorage
// is async. Approximated here: init synchronously with the device locale
// above (so there's never a flash of untranslated content), then swap to
// any previously-saved explicit choice once AsyncStorage resolves.
AsyncStorage.getItem(STORAGE_KEY).then((saved) => {
  if (saved && SUPPORTED_LANGUAGES.includes(saved)) {
    i18n.changeLanguage(saved);
  }
});

export function persistLanguage(lng: string) {
  AsyncStorage.setItem(STORAGE_KEY, lng);
}

export default i18n;
