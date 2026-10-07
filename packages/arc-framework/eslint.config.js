import eslint from "@eslint/js";
import { join } from "node:path";
import tseslint from "typescript-eslint";
import { composeArchitectureBans, TYPESCRIPT_SCOPE } from "./eslint/architecture-config.ts";
import { createArchitectureImportsRule } from "./eslint/architecture-imports.ts";

const src = (path) => `src/${path}`;
const subtree = (path) => `src/${path}/${TYPESCRIPT_SCOPE}`;
const dependencyMessage = "Use the owning architecture boundary";
const referenceSyntax = (regex) => [
  `ImportExpression[source.value=${regex}]`,
  `TSImportType[source.value=${regex}]`,
  `CallExpression[callee.name="require"][arguments.0.value=${regex}]`,
  `CallExpression[callee.object.name="module"][callee.property.name="require"][arguments.0.value=${regex}]`,
].map((selector) => ({ selector, message: dependencyMessage }));
const symbolSyntax = (regex, message) => [
  `Identifier[name=${regex}]`,
  `ImportSpecifier[imported.value=${regex}]`,
  `ExportSpecifier[local.value=${regex}]`,
  `MemberExpression[property.value=${regex}]`,
].map((selector) => ({ selector, message }));
const referencePattern = (regex) => ({ regex, caseSensitive: true });
const restrictedReference = (regex, caseSensitive = true) => ({
  patterns: [{ regex, caseSensitive }],
  syntax: referenceSyntax(`/${regex.replaceAll("/", "\\/")}/${caseSensitive ? "" : "i"}`),
});
const schemaOwners = ["lib/change-facts.schema.ts", "scripts/review-gate/core/gate-contract-v2-schema.ts",
  "scripts/review-gate/core/review-primitives.ts", "scripts/review-gate/policy/assurance-schema.ts",
  "scripts/review-gate/policy/standard-review-projection-schema.ts", "scripts/review-gate/policy/standard-review-schema.ts",
  "scripts/review-gate/policy/project-promotion-schema.ts", "scripts/review-gate/policy/routing-schema.ts"].map(src);
const viewerFiles = ["lib/view-artifact.ts", "lib/view-renderer.ts", "lib/view/types.ts", "lib/view/format.ts", "lib/view/clock.ts"].map(src);
const validationBan = restrictedReference("(?:^|/)validation\\.js$");
const architectureBans = [
  { files: [`src/${TYPESCRIPT_SCOPE}`], predicates: ["neverthrow"] },
  { files: [`src/lib/kernel/${TYPESCRIPT_SCOPE}`], predicates: ["kernel"] },
  { files: [`src/${TYPESCRIPT_SCOPE}`], predicates: ["store-production", "store-reference"] },
  { files: [`__tests__/${TYPESCRIPT_SCOPE}`], predicates: ["store-tests"] },
  { files: [`src/${TYPESCRIPT_SCOPE}`], ignores: [`src/lib/layout/${TYPESCRIPT_SCOPE}`], predicates: ["layout-private"] },
  { files: [`src/lib/layout/${TYPESCRIPT_SCOPE}`], predicates: ["layout-dependencies"] },
  { files: [`src/commands/${TYPESCRIPT_SCOPE}`, `src/handlers/${TYPESCRIPT_SCOPE}`], predicates: ["layout-downward"] },
  { files: [`src/lib/store/concurrency/${TYPESCRIPT_SCOPE}`], predicates: ["store-concurrency"] },
  { files: [`src/${TYPESCRIPT_SCOPE}`], ignores: ["src/lib/git/identity.ts"], predicates: ["configured-identity"] },
  {
    files: [src("lib/kernel/canonical/canonical-json.ts")],
    ...restrictedReference("^zod(?:/.*)?$"),
  },
  {
    files: [`src/${TYPESCRIPT_SCOPE}`],
    ignores: [src("lib/active/meta-reader.ts"), src("lib/store/in-repo/write-admission.ts")],
    syntax: [{ selector: 'CallExpression[callee.name="parseMetaProjectionRecord"]', message: "Read semantic meta through its owner" }],
  },
  {
    files: [`src/${TYPESCRIPT_SCOPE}`],
    ignores: [src("lib/active/meta-reader.ts"), src("scripts/validate-meta-spec.ts")],
    syntax: [{ selector: 'CallExpression[callee.name="parseIdentifierList"]', message: "Read identifier lists through their owner" }],
  },
  {
    files: [src("lib/active/meta-reader.ts")],
    syntax: [{ selector: 'ImportDeclaration[source.value=/\\/store\\//]', message: "Keep the store delegate dynamic" }],
  },
  {
    files: ["lib/errand/promote.ts", "lib/git/worktree-scaffold.ts", "lib/work-unit/pointer-record.ts",
      "lib/work-unit/verbs/park-resume.ts", "lib/work-unit/verbs/stub.ts"].map(src),
    syntax: symbolSyntax("/^(MetaProjectionOverrides|renderMetaProjectionFile)$/", "Produce complete semantic meta records"),
  },
  {
    files: ["lib/config/index.ts", "lib/config/status-reader.ts", "lib/config/resolve-override.ts", "lib/config/resolved-settings.ts",
      "lib/commit-check/config.ts", "lib/git/worktree-location.ts", "lib/git/worktree-harness-dirs.ts", "commands/config/validate.ts"].map(src),
    syntax: [{ selector: 'VariableDeclaration[kind="const"] > VariableDeclarator[id.name="DEFAULTS"]', message: "Use the config catalog defaults" }],
  },
  {
    files: [src("lib/locus/role-derivation.ts")],
    ...restrictedReference("^(?!\\.\\./git/worktree-roster\\.js$).*"),
  },
  {
    files: viewerFiles,
    paths: ["node:child_process", "node:fs", "node:fs/promises", "../io-context.js"],
    patterns: [referencePattern("/commands/")],
    syntax: [...referenceSyntax('/^(node:child_process|node:fs|node:fs\\/promises|\\.\\.\\/io-context\\.js)$/'),
      ...referenceSyntax('/\\/commands\\//'),
      { selector: 'MemberExpression[object.name="process"][computed=false]', message: "Inject viewer process effects" }],
  },
  {
    files: [src("lib/work-unit/git-decompose-transition-base-advancement.ts")],
    ...restrictedReference("retirement-authority", false),
  },
  {
    files: [subtree("scripts/review-gate/core")],
    ...restrictedReference("\\.\\./(?:hosts|providers|runtime)/"),
  },
  {
    files: [subtree("scripts/review-gate")], ignores: [src("scripts/review-gate/core/identity.ts")],
    syntax: symbolSyntax('"canonicalizePlainJson"', "Keep canonical helper use in its owner"),
  },
  {
    files: [subtree("scripts/review-gate")],
    ignores: [src("scripts/review-gate/core/request-key.ts"), src("scripts/review-gate/core/legacy-canonical-v1.ts")],
    syntax: symbolSyntax('"canonicalizeReviewGateV1"', "Keep frozen canonical helper use at its boundary"),
  },
  {
    files: [subtree("scripts/review-gate")],
    syntax: ["name", "value"].map((field) => ({
      selector: `ExportNamedDeclaration > ExportSpecifier[local.${field}=/^(canonicalizePlainJson|canonicalizeReviewGateV1)$/]`,
      message: "Import canonical helpers directly from their owners",
    })),
  },
  {
    files: [subtree("scripts/review-gate")],
    ignores: ["contracts", "evidence", "execution", "receipt-payload"].map((name) => src(`scripts/review-gate/core/${name}.ts`)),
    ...validationBan,
  },
  {
    files: schemaOwners,
    patterns: validationBan.patterns,
    syntax: [...validationBan.syntax,
      { selector: 'TSInterfaceDeclaration', message: "Derive schema-owned types from Zod" },
      { selector: 'FunctionDeclaration[id.name=/^(parse|project|validate)/]', message: "Use the schema validator or registrar" },
      { selector: 'VariableDeclarator[id.type="Identifier"][id.name=/^(parse|project|validate)/]', message: "Use the schema validator or registrar" }],
  },
  {
    files: [src("cli.ts")],
    patterns: [{ ...referencePattern("^\\./(?:handlers|commands|scripts)/"), allowTypeImports: true }],
  },
  {
    files: [src("commands/active/status.ts")],
    paths: ["../../lib/config/status-reader.js", "../../lib/work-unit/submission-boundary-store.js",
      "../../lib/work-unit/candidate-record-store.js", "../../lib/work-unit/candidate-attestation.js",
      "../../lib/work-unit/git-candidate-effective-target.js", "../../scripts/review-gate/policy/integration-boundary-locus.js",
      "../../scripts/review-gate/policy/candidate-review-fix-continuation.js"].map((name) => ({ name, allowTypeImports: true })),
  },
  {
    files: [src("handlers/view.ts")], paths: ["../commands/active.js", "../lib/git/index.js"],
    syntax: referenceSyntax('/^(\\.\\.\\/commands\\/active\\.js|\\.\\.\\/lib\\/git\\/index\\.js)$/'),
  },
  {
    files: [src("commands/active/status.ts")], paths: ["../../lib/git/index.js"],
    syntax: referenceSyntax('/^\\.\\.\\/\\.\\.\\/lib\\/git\\/index\\.js$/'),
  },
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
