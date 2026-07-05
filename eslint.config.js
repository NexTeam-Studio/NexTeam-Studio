import tseslint from "@typescript-eslint/eslint-plugin";
import tsParser from "@typescript-eslint/parser";

export default [
  {
    ignores: [
      "dist/**",
      "**/dist/**",
      "node_modules/**",
      "coverage/**",
      "tmp/**",
      "tmp-proof/**",
      "docs/**",
      "src/**",
      "standalone-agent-demo/**"
    ]
  },
  {
    files: ["apps/**/*.{ts,tsx}", "packages/**/*.{ts,tsx}", "tests/**/*.ts"],
    languageOptions: {
      parser: tsParser,
      parserOptions: {}
    },
    plugins: {
      "@typescript-eslint": tseslint
    },
    rules: {
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/consistent-type-imports": "error",
      "@typescript-eslint/no-unused-vars": ["error", { "argsIgnorePattern": "^_" }]
    }
  }
];
