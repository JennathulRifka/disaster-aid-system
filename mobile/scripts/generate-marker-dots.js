// One-off generator for the map marker dot PNGs in mobile/assets/dots/.
// Not run automatically — re-run manually with `node scripts/generate-marker-dots.js`
// only if a marker color changes or a new one is added.
//
// Why this exists: react-native-maps' custom-View markers (a plain <View>
// passed as a Marker's child) have a long-standing, unfixed Android bug
// where `anchor` isn't reliably honored (react-native-maps/react-native-maps
// GitHub issues #230, #328, #5435 — the last one closed by the maintainers
// as "not planned"). Image-based markers don't have this ambiguity: Android
// gets a real bitmap with known pixel dimensions up front, instead of
// snapshotting a JS-rendered View whose measured size can be wrong at the
// moment the anchor offset gets computed. This generates that fixed set of
// images so both map files (SituationMapScreen.tsx, AreaSeverityMap.tsx)
// can `require()` them directly instead of rendering a <ColorDot> child.
const fs = require("fs");
const path = require("path");
const { PNG } = require("pngjs");

// Every distinct hex color used by a map MARKER across both files (checked
// via grep before writing this list — text colors like #374151 and accent
// colors like #ea580c are deliberately excluded, they're not marker fills).
const COLORS = {
  green: "#16a34a",
  blue: "#2563eb",
  gray: "#6b7280",
  lightgray: "#9ca3af",
  red: "#dc2626",
  amber: "#f59e0b",
  orange: "#f97316",
  pink: "#f9a8d4",
};

// Two sizes per color: "small" covers every fixed-size dot in both files
// (10-18dp originally), "large" covers the few markers that were bigger
// (the areas tab's count-scaled dots, up to 36dp).
//
// FIXED (user-reported): these used to be generated as one flat PNG per
// tier with NO @2x/@3x density suffix. Metro/RN treats an unsuffixed image
// asset as the 1x variant, meaning its raw pixel dimensions become its
// LOGICAL (dp) render size on every device, regardless of actual screen
// density — a 96px "large" PNG rendered as a 96dp marker, not the intended
// ~32dp, which is exactly why the areas-tab dot looked "hugeeeeee" on a
// real phone (small looked oversized too, just less dramatically at 48dp
// instead of ~16dp). Fixed by generating a real @1x/@2x/@3x density triplet
// per tier at the ACTUAL target dp size — Metro auto-picks the matching
// file for the device's pixel ratio and reports the correct logical size,
// so `require("./green-small.png")` in markerDots.ts needs no code change.
const TARGET_DP = { small: 16, large: 32 };
const DENSITIES = [1, 2, 3]; // -> base filename, @2x, @3x

function hexToRgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

function drawDot(size, fill) {
  const png = new PNG({ width: size, height: size });
  const cx = size / 2;
  const cy = size / 2;
  const r = size / 2 - 1; // 1px margin so anti-aliasing doesn't clip
  const borderWidth = Math.max(2, Math.round(size * 0.06));
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const idx = (size * y + x) << 2;
      const dx = x + 0.5 - cx;
      const dy = y + 0.5 - cy;
      const dist = Math.sqrt(dx * dx + dy * dy);
      let color = null;
      if (dist <= r) {
        color = dist >= r - borderWidth ? { r: 255, g: 255, b: 255 } : fill;
      }
      if (color) {
        png.data[idx] = color.r;
        png.data[idx + 1] = color.g;
        png.data[idx + 2] = color.b;
        png.data[idx + 3] = 255;
      } else {
        png.data[idx + 3] = 0;
      }
    }
  }
  return png;
}

const outDir = path.join(__dirname, "..", "assets", "dots");
fs.mkdirSync(outDir, { recursive: true });

let count = 0;
for (const [name, hex] of Object.entries(COLORS)) {
  const fill = hexToRgb(hex);
  for (const [sizeName, dp] of Object.entries(TARGET_DP)) {
    for (const density of DENSITIES) {
      const px = dp * density;
      const png = drawDot(px, fill);
      const suffix = density === 1 ? "" : `@${density}x`;
      const outPath = path.join(outDir, `${name}-${sizeName}${suffix}.png`);
      const buffer = PNG.sync.write(png, { deflateLevel: 9 });
      fs.writeFileSync(outPath, buffer);
      count++;
    }
  }
}
console.log(`Generated ${count} marker dot PNGs in ${outDir}`);
