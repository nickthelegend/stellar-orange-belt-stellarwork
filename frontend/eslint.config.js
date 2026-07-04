import js from "@eslint/js";

// Flat ESLint config (ESLint v9). Kept dependency-light: core rules plus the
// browser/ES globals the app uses, so `npm run lint` runs without extra plugins.
export default [
  js.configs.recommended,
  {
    files: ["src/**/*.{js,jsx}"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
      parserOptions: { ecmaFeatures: { jsx: true } },
      globals: {
        window: "readonly",
        document: "readonly",
        console: "readonly",
        fetch: "readonly",
        setTimeout: "readonly",
        clearInterval: "readonly",
        setInterval: "readonly",
        Date: "readonly",
        BigInt: "readonly",
        Boolean: "readonly",
        Number: "readonly",
        String: "readonly",
        Promise: "readonly",
      },
    },
    rules: {
      "no-unused-vars": ["warn", { argsIgnorePattern: "^_", varsIgnorePattern: "^[A-Z_]" }],
      "no-undef": "error",
    },
  },
  {
    // Test files run under Vitest globals + jsdom.
    files: ["src/**/*.test.{js,jsx}", "src/test/**"],
    languageOptions: {
      globals: {
        describe: "readonly",
        it: "readonly",
        expect: "readonly",
        vi: "readonly",
        beforeEach: "readonly",
        afterEach: "readonly",
      },
    },
  },
];
