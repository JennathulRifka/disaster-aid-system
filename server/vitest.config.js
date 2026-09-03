const { defineConfig } = require("vitest/config");

// globals: true so test files can use describe/it/expect without an import —
// this server is plain CommonJS (require()), and Vitest itself can only be
// imported via ESM import syntax, so globals avoids mixing module styles in
// every single test file.
module.exports = defineConfig({
  test: {
    globals: true,
    environment: "node",
  },
});
