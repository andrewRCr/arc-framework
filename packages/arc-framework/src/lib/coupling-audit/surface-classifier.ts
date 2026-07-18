/**
 * Exhaustive ordered path classifier for the coupling-audit corpus.
 *
 * @module
 */

import type { SurfaceKind } from "./types.js";

interface SurfaceRule {
  readonly id: string;
  readonly kind: SurfaceKind;
  readonly matches: (path: string) => boolean;
}

const PACKAGE_ROOT_CONFIG = new Set([
  "packages/arc-framework/.gitignore",
  "packages/arc-framework/eslint.config.js",
  "packages/arc-framework/init-recipe.json",
  "packages/arc-framework/package.json",
  "packages/arc-framework/tsconfig.json",
  "packages/arc-framework/tsconfig.test.json",
  "packages/arc-framework/tsup.config.ts",
  "packages/arc-framework/vitest.config.ts",
]);

const ROOT_CONFIG = new Set([
  ".coderabbit.yaml",
  ".editorconfig",
  ".gitattributes",
  ".gitignore",
  ".markdownlint-cli2.jsonc",
  "mkdocs.yml",
  "package-lock.json",
  "package.json",
]);

const CONFIG_EXTENSIONS = [".json", ".jsonc", ".toml", ".yaml", ".yml"] as const;

/**
 * Ordered rules implement the closed taxonomy. Earlier families own overlaps,
 * such as workflow templates and test fixtures.
 */
const SURFACE_RULES: readonly SurfaceRule[] = [
  {
    id: "tests",
    kind: "test",
    matches: (path) => path.startsWith("packages/arc-framework/__tests__/"),
  },
  {
    id: "workflows",
    kind: "workflow",
    matches: (path) =>
      path.startsWith("packages/arc-framework/arc/system/workflows/") ||
      path.startsWith(".arc/system/workflows/"),
  },
  {
    id: "templates",
    kind: "template",
    matches: (path) =>
      path.startsWith("packages/arc-framework/templates/") ||
      path.startsWith("packages/arc-framework/arc/reference/templates/") ||
      path.startsWith(".arc/reference/templates/"),
  },
  {
    id: "package-config",
    kind: "config",
    matches: (path) =>
      PACKAGE_ROOT_CONFIG.has(path) ||
      path.startsWith("packages/arc-framework/changelog/") ||
      path === "packages/arc-framework/arc/reference/templates/arc/merge-gate/CODEOWNERS",
  },
  {
    id: "executable-code",
    kind: "code",
    matches: (path) =>
      path.startsWith("packages/arc-framework/src/") ||
      path.startsWith("packages/arc-framework/arc/system/.internal/githooks/") ||
      path.startsWith("packages/arc-framework/arc/system/.internal/harness-hooks/") ||
      path.startsWith("packages/arc-framework/arc/system/.internal/scripts/") ||
      path.startsWith(".arc/system/.internal/githooks/") ||
      path.startsWith(".arc/system/.internal/harness-hooks/") ||
      path.startsWith(".arc/system/.internal/scripts/") ||
      path.startsWith(".husky/") ||
      path.startsWith("scripts/"),
  },
  {
    id: "prose",
    kind: "prose",
    matches: (path) => path.endsWith(".md") || path === "AGENTS.md" || path === "CLAUDE.md",
  },
  {
    id: "declarative-config",
    kind: "config",
    matches: (path) =>
      ROOT_CONFIG.has(path) ||
      path === ".github/CODEOWNERS" ||
      path.endsWith("/.gitignore") ||
      path.endsWith("/.gitkeep") ||
      CONFIG_EXTENSIONS.some((extension) => path.endsWith(extension)),
  },
];

/**
 * Classify one normalized corpus path into exactly one surface family.
 *
 * @param inputPath - Repository-relative path using either platform separator.
 * @returns The closed surface kind selected by ordered precedence.
 * @throws When no recognized family owns the path.
 */
export function classifySurface(inputPath: string): SurfaceKind {
  const path = inputPath.replaceAll("\\", "/");
  const match = SURFACE_RULES.find((rule) => rule.matches(path));
  if (match !== undefined) return match.kind;
  throw new Error(`Unrecognized coupling-audit surface family: ${path}`);
}
