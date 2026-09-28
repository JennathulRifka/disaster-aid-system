import { Text, type TextProps } from "react-native";
import { useAccessibility } from "../context/AccessibilityContext";

interface AppTextProps extends TextProps {
  /** Font size at the "normal" scale, in px — defaults to Tailwind's text-sm (14). */
  baseSize?: number;
  /** Secondary/caption text — forced to solid black when high contrast is on
   * (same targeted "just the muted gray classes" approach web's high-contrast
   * mode uses, not a blanket filter). */
  muted?: boolean;
}

/**
 * A small `Text` wrapper that actually applies the accessibility context's
 * fontScale/highContrast — see AccessibilityContext.tsx for why this is a
 * scoped, opt-in mechanism rather than an automatic app-wide override.
 * Swap in for a plain `<Text>` wherever a screen wants to honor these
 * preferences; screens that don't render `<Text>` as before, unaffected.
 */
export function AppText({ baseSize = 14, muted, style, ...props }: AppTextProps) {
  const { fontScale, highContrast } = useAccessibility();
  return (
    <Text
      {...props}
      style={[{ fontSize: baseSize * fontScale }, muted && highContrast ? { color: "#000000" } : null, style]}
    />
  );
}
