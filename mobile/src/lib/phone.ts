// Mirrors server/src/utils/phone.js and web/src/lib/phone.ts — client-side
// copy so RegisterScreen.tsx can validate before submitting. The server
// re-validates (and is the authoritative check) regardless.

/**
 * Validates and normalizes a Sri Lankan mobile number to the bare digit
 * format Text.lk's API expects: country code + number, no "+", no leading
 * zero (e.g. "94771234567"). Returns null if the input isn't empty but also
 * isn't a valid Sri Lankan mobile number.
 */
export function normalizeSriLankanPhone(input: string): string | null {
  if (!input) return null;
  const digits = input.replace(/\D/g, "");

  let normalized: string;
  if (digits.length === 10 && digits.startsWith("0")) {
    normalized = "94" + digits.slice(1);
  } else if (digits.length === 11 && digits.startsWith("94")) {
    normalized = digits;
  } else if (digits.length === 9) {
    normalized = "94" + digits;
  } else {
    return null;
  }

  if (normalized[2] !== "7") return null;
  return normalized;
}
