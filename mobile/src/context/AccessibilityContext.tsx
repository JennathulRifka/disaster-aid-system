import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";

/**
 * Mobile port of web's src/lib/accessibility.ts — same two preferences
 * (text size, high contrast), same persistence intent, but a genuinely
 * different mechanism. Web sets `<html>`'s own font-size directly, which
 * Tailwind's rem-based text-* classes are always relative to — one hack
 * scales the whole document. React Native has no equivalent "root em"
 * concept (NativeWind compiles className to fixed inline styles, not
 * CSS custom properties an app-wide rule can key off), so there is no
 * single override that reaches every Text element automatically. Instead
 * this is a React Context exposing a numeric `fontScale` multiplier and a
 * `highContrast` flag, applied deliberately wherever a screen opts in (see
 * AppText.tsx) — a real, working, but honestly narrower rollout than web's
 * true root-level scale. Persisted via AsyncStorage (web's localStorage
 * equivalent) so it survives app restarts, same as every preference this
 * project already persists this way (SOS button position, language choice).
 */

export type FontScale = "normal" | "large" | "xlarge";

const FONT_SCALE_KEY = "accessibility_font_scale";
const HIGH_CONTRAST_KEY = "accessibility_high_contrast";

const SCALE_MULTIPLIER: Record<FontScale, number> = {
  normal: 1,
  large: 1.125,
  xlarge: 1.25,
};

interface AccessibilityContextValue {
  fontScaleKey: FontScale;
  fontScale: number;
  highContrast: boolean;
  setFontScaleKey: (scale: FontScale) => void;
  setHighContrast: (enabled: boolean) => void;
}

const AccessibilityContext = createContext<AccessibilityContextValue>({
  fontScaleKey: "normal",
  fontScale: 1,
  highContrast: false,
  setFontScaleKey: () => {},
  setHighContrast: () => {},
});

export function AccessibilityProvider({ children }: { children: ReactNode }) {
  const [fontScaleKey, setFontScaleKeyState] = useState<FontScale>("normal");
  const [highContrast, setHighContrastState] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(FONT_SCALE_KEY)
      .then((v) => {
        if (v === "large" || v === "xlarge" || v === "normal") setFontScaleKeyState(v);
      })
      .catch(() => {});
    AsyncStorage.getItem(HIGH_CONTRAST_KEY)
      .then((v) => {
        if (v === "1") setHighContrastState(true);
      })
      .catch(() => {});
  }, []);

  function setFontScaleKey(scale: FontScale) {
    setFontScaleKeyState(scale);
    AsyncStorage.setItem(FONT_SCALE_KEY, scale).catch(() => {});
  }

  function setHighContrast(enabled: boolean) {
    setHighContrastState(enabled);
    AsyncStorage.setItem(HIGH_CONTRAST_KEY, enabled ? "1" : "0").catch(() => {});
  }

  return (
    <AccessibilityContext.Provider
      value={{
        fontScaleKey,
        fontScale: SCALE_MULTIPLIER[fontScaleKey],
        highContrast,
        setFontScaleKey,
        setHighContrast,
      }}
    >
      {children}
    </AccessibilityContext.Provider>
  );
}

export function useAccessibility() {
  return useContext(AccessibilityContext);
}
