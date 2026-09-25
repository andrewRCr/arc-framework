import eslint from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  eslint.configs.recommended,
  ...tseslint.configs.strictTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        project: ["tsconfig.json", "tsconfig.test.json"],
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      "@typescript-eslint/restrict-template-expressions": [
        "error",
        { allowNumber: true },
      ],
    },
  },
  {
    files: ["src/**/*.ts"],
    rules: {
      "max-lines-per-function": [
        "error",
        { max: 100, skipBlankLines: true, skipComments: true, IIFEs: true },
      ],
      "max-lines": ["error", { max: 1000, skipBlankLines: true, skipComments: true }],
      complexity: ["error", { max: 15 }],
      "max-depth": ["error", { max: 4 }],
      "max-nested-callbacks": ["error", { max: 4 }],
    },
  },
  {
    files: ["__tests__/**/*.ts"],
    ...tseslint.configs.disableTypeChecked,
    rules: {
      ...tseslint.configs.disableTypeChecked.rules,
      "@typescript-eslint/no-non-null-assertion": "off",
      "max-lines": ["error", { max: 1500, skipBlankLines: true, skipComments: true }],
    },
  },
  {
    ignores: ["dist/", "eslint.config.js"],
  },
);
