/**
 * Validates and normalizes a Sri Lankan mobile number to the bare digit
 * format Text.lk's API expects: country code + number, no "+", no leading
 * zero (e.g. "94771234567"). Accepts common ways a user might type one:
 * "0771234567", "+94771234567", "94771234567", with or without spaces/dashes.
 * Returns the normalized string, or null if the input isn't empty but also
 * isn't a valid Sri Lankan mobile number (landlines and other countries'
 * numbers are rejected — this app only ever SMS's Sri Lankan phones).
 */
function normalizeSriLankanPhone(input) {
  if (!input) return null;
  const digits = String(input).replace(/\D/g, "");

  let normalized;
  if (digits.length === 10 && digits.startsWith("0")) {
    normalized = "94" + digits.slice(1);
  } else if (digits.length === 11 && digits.startsWith("94")) {
    normalized = digits;
  } else if (digits.length === 9) {
    normalized = "94" + digits;
  } else {
    return null;
  }

  // Sri Lankan mobile prefixes are 07X — after stripping the "94" country
  // code, the next digit must be 7 (rejects landlines, which start 011 etc).
  if (normalized[2] !== "7") return null;
  return normalized;
}

module.exports = { normalizeSriLankanPhone };
