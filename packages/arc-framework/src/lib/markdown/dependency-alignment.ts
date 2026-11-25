/** Pure dependency-metadata alignment for Markdown width semantics. */

import { ArcError } from "../kernel/index.js";

/** Manifest, lockfile, and loaded-module evidence for Markdown dependencies. */
export interface MarkdownDependencyAlignmentInput {
  readonly rootManifest: unknown;
  readonly packageManifest: unknown;
  readonly lockfile: unknown;
  readonly runtimeVersions: MarkdownRuntimeVersions;
}

/** One aligned pair of versions used by Markdown linting and rendering. */
export interface MarkdownDependencyVersions {
  readonly markdownlint: string;
  readonly stringWidth: string;
}

/** Implementations resolved by staged tooling and the worktree CLI2 entry point. */
export interface MarkdownRuntimeVersions extends MarkdownDependencyVersions {
  readonly cli2: MarkdownDependencyVersions;
}

function recordAt(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new ArcError(`${label} must be an object`, "markdown.dependency-misaligned");
  }
  return value as Record<string, unknown>;
}

function stringAt(value: unknown, label: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new ArcError(`${label} must be an exact version`, "markdown.dependency-misaligned");
  }
  return value;
}

function dependencyAt(value: unknown, dependency: string, label: string): string {
  const dependencies = recordAt(recordAt(value, label).dependencies, `${label}.dependencies`);
  return stringAt(dependencies[dependency], `${label}.dependencies.${dependency}`);
}

function devDependencyAt(value: unknown, dependency: string, label: string): string {
  const dependencies = recordAt(recordAt(value, label).devDependencies, `${label}.devDependencies`);
  return stringAt(dependencies[dependency], `${label}.devDependencies.${dependency}`);
}

function requireEqual(actual: string, expected: string, label: string): void {
  if (actual !== expected) {
    throw new ArcError(
      `${label} resolves ${actual}, expected ${expected}`,
      "markdown.dependency-misaligned",
    );
  }
}

function lockedDependency(
  packages: Record<string, unknown>, from: string, name: string,
): { path: string; value: Record<string, unknown> } {
  let parent = from;
  for (;;) {
    const path = `${parent ? `${parent}/` : ""}node_modules/${name}`;
    if (Object.hasOwn(packages, path)) return { path, value: recordAt(packages[path], `locked ${path}`) };
    if (!parent) throw new ArcError(`Missing locked ${name}`, "markdown.dependency-misaligned");
    const ancestor = parent.lastIndexOf("/node_modules/");
    parent = ancestor < 0 ? "" : parent.slice(0, ancestor);
  }
}

/** Validate all declared, locked, and loaded versions against markdownlint's width dependency. */
export function assertMarkdownDependencyAlignment(
  input: MarkdownDependencyAlignmentInput,
): MarkdownDependencyVersions {
  const lockPackages = recordAt(recordAt(input.lockfile, "lockfile").packages, "lockfile.packages");
  const lockedRoot = recordAt(lockPackages[""], "lockfile.packages['']");
  const lockedPackage = recordAt(lockPackages["packages/arc-framework"], "lockfile package workspace");
  const lockedMarkdownlint = recordAt(lockPackages["node_modules/markdownlint"], "locked markdownlint");
  const lockedStringWidth = recordAt(lockPackages["node_modules/string-width"], "locked string-width");
  const markdownlint = input.runtimeVersions.markdownlint;
  const stringWidth = dependencyAt(lockedMarkdownlint, "string-width", "locked markdownlint");

  requireEqual(devDependencyAt(input.rootManifest, "markdownlint", "root manifest"), markdownlint, "root markdownlint");
  requireEqual(devDependencyAt(lockedRoot, "markdownlint", "locked root"), markdownlint, "locked root markdownlint");
  requireEqual(stringAt(lockedMarkdownlint.version, "locked markdownlint.version"), markdownlint, "locked markdownlint");
  requireEqual(dependencyAt(input.packageManifest, "string-width", "package manifest"), stringWidth, "package string-width");
  requireEqual(dependencyAt(lockedPackage, "string-width", "locked package workspace"), stringWidth, "locked package string-width");
  requireEqual(stringAt(lockedStringWidth.version, "locked string-width.version"), stringWidth, "locked string-width");
  requireEqual(input.runtimeVersions.stringWidth, stringWidth, "loaded string-width");

  const cliPath = "node_modules/markdownlint-cli2";
  dependencyAt(lockPackages[cliPath], "markdownlint", "locked markdownlint-cli2");
  const cliLinter = lockedDependency(lockPackages, cliPath, "markdownlint");
  const cliWidth = lockedDependency(lockPackages, cliLinter.path, "string-width");
  requireEqual(stringAt(cliLinter.value.version, "CLI2 markdownlint.version"), markdownlint, "CLI2 markdownlint");
  requireEqual(dependencyAt(cliLinter.value, "string-width", "CLI2 markdownlint"), stringWidth, "CLI2 width dependency");
  requireEqual(stringAt(cliWidth.value.version, "CLI2 string-width.version"), stringWidth, "CLI2 string-width");
  const stagedWidth = lockedDependency(lockPackages, "node_modules/markdownlint", "string-width");
  requireEqual(stringAt(stagedWidth.value.version, "markdownlint string-width.version"), stringWidth, "markdownlint string-width");
  requireEqual(input.runtimeVersions.cli2.markdownlint, markdownlint, "loaded CLI2 markdownlint");
  requireEqual(input.runtimeVersions.cli2.stringWidth, stringWidth, "loaded CLI2 string-width");

  return { markdownlint, stringWidth };
}
