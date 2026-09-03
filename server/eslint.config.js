const js = require("@eslint/js");
const globals = require("globals");

module.exports = [
  { ignores: ["node_modules", "src/data/*.json"] },
  js.configs.recommended,
  {
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "commonjs",
      globals: { ...globals.node, ...globals.es2021 },
    },
    rules: {
      // A leading underscore is this project's convention for "intentionally
      // unused" (e.g. an Express handler's unused `req` or a destructured
      // field kept for shape/documentation purposes).
      "no-unused-vars": ["warn", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
    },
  },
  {
    files: ["**/__tests__/**/*.test.js"],
    languageOptions: {
      globals: globals.vitest,
    },
  },
];
