import eslint from "@eslint/js";
import { join } from "node:path";
import tseslint from "typescript-eslint";
import { composeArchitectureBans, TYPESCRIPT_SCOPE } from "./eslint/architecture-config.ts";
import { createArchitectureImportsRule } from "./eslint/architecture-imports.ts";

const architectureBans = [
  { files: [`src/${TYPESCRIPT_SCOPE}`], predicates: ["neverthrow"] },
  { files: [`src/lib/kernel/${TYPESCRIPT_SCOPE}`], predicates: ["kernel"] },
];

export default tseslint.config(
  eslint.configs.recommended,
  ...tseslint.configs.strictTypeChecked,
  {
    plugins: {
      arc: { rules: { "architecture-imports": createArchitectureImportsRule(join(import.meta.dirname, "src")) } },
    },
  },
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
      // A `default` never stands in for an unlisted union member, so adding a member fails every switch that
      // ignores it. Switches over open types such as `string` need no `default`.
      "@typescript-eslint/switch-exhaustiveness-check": [
        "error",
        { considerDefaultExhaustiveForUnions: false, requireDefaultForNonUnion: false },
      ],
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
  ...composeArchitectureBans(architectureBans),
  {
    ignores: ["dist/", "eslint.config.js"],
  },
);
