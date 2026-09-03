import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["dist", "node_modules"] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
    },
    rules: {
      // Deliberately NOT spreading react-hooks' full "recommended" config —
      // v7+ ships a React Compiler-oriented ruleset (set-state-in-effect,
      // purity, etc.) calibrated for React 19 + the compiler, not this
      // project's plain React 18. It flags this codebase's own intentional,
      // documented patterns as errors — e.g. AdminRequests.tsx's isStale()
      // calling Date.now() during render (refreshed via a deliberate
      // setInterval re-render tick, see CLAUDE.md "Stale request flags") and
      // the standard "setLoading(true) then fetch" pattern used in nearly
      // every page's data-fetching effect. Keeping just the two
      // long-standing, universally-useful rules instead.
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "warn",
      "react-refresh/only-export-components": ["warn", { allowConstantExport: true }],
      // Unused vars are a real bug signal, but a leading underscore is the
      // established convention for "intentionally unused" (e.g. destructured
      // props/params kept for shape/documentation purposes).
      "@typescript-eslint/no-unused-vars": ["warn", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
      // This codebase uses `any` deliberately in a handful of Leaflet/GeoJSON
      // typing edge cases (see AreaSeverityMap.tsx, SituationMap.tsx) rather
      // than fighting react-leaflet's incomplete generic types — warn, don't
      // block, so real issues aren't drowned out by these known spots.
      "@typescript-eslint/no-explicit-any": "warn",
    },
  },
  {
    files: ["**/__tests__/**/*.test.{ts,tsx}"],
    languageOptions: {
      globals: globals.vitest,
    },
  }
);
