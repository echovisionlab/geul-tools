import globals from "globals";
import js from "@eslint/js";
import tseslint from "typescript-eslint";
export default tseslint.config(
  {
    ignores: [
      "**/dist/**",
      "node_modules/**",
      ".artifacts/**",
      "**/.artifacts/**",
      "apps/*/public/vendors/**",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["**/*.cjs"],
    languageOptions: { globals: globals.node },
    rules: { "@typescript-eslint/no-require-imports": "off" },
  },
  {
    files: ["shared/components/core/Badge/LabelBadge.tsx"],
    rules: { "@typescript-eslint/no-explicit-any": "off" },
  },
  {
    files: ["**/*.{ts,tsx,mjs}"],
    languageOptions: { globals: { ...globals.browser, ...globals.node } },
    rules: {
      "@typescript-eslint/no-empty-object-type": "off",
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
    },
  },
);
