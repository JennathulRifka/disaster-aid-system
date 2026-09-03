/**
 * Text-size and high-contrast preferences. Deliberately not React state/context
 * — these mutate the document root directly (font-size is set on <html> so
 * Tailwind's rem-based text-* classes, which are always relative to the root,
 * scale everywhere app-wide) and persist to localStorage. The control that
 * lets a user change these lives only on the public map pages (Landing,
 * PublicSeverityMap) per the "map isn't user-friendly for all knowledge
 * levels" feedback, but the effect itself is global and outlives navigating
 * away from those pages — a genuine accessibility setting shouldn't reset
 * just because you moved to another page.
 */

export type FontScale = "normal" | "large" | "xlarge";

const FONT_SCALE_KEY = "accessibility_font_scale";
const HIGH_CONTRAST_KEY = "accessibility_high_contrast";

const SCALE_PERCENT: Record<FontScale, string> = {
  normal: "100%",
  large: "112.5%",
  xlarge: "125%",
};

export function getFontScale(): FontScale {
  try {
    const v = localStorage.getItem(FONT_SCALE_KEY);
    if (v === "large" || v === "xlarge" || v === "normal") return v;
  } catch {
    // localStorage unavailable (private browsing etc.) — fall through to default
  }
  return "normal";
}

export function setFontScale(scale: FontScale) {
  try {
    localStorage.setItem(FONT_SCALE_KEY, scale);
  } catch {
    // ignore — the DOM change below still applies for this page view
  }
  document.documentElement.style.fontSize = SCALE_PERCENT[scale];
}

export function getHighContrast(): boolean {
  try {
    return localStorage.getItem(HIGH_CONTRAST_KEY) === "1";
  } catch {
    return false;
  }
}

export function setHighContrast(enabled: boolean) {
  try {
    localStorage.setItem(HIGH_CONTRAST_KEY, enabled ? "1" : "0");
  } catch {
    // ignore
  }
  document.documentElement.classList.toggle("high-contrast", enabled);
}

/** Call once at app startup to restore whatever was saved last time. */
export function applyStoredAccessibilityPrefs() {
  document.documentElement.style.fontSize = SCALE_PERCENT[getFontScale()];
  document.documentElement.classList.toggle("high-contrast", getHighContrast());
}
