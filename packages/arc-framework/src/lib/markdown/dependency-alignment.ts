/** Pure dependency-metadata alignment for Markdown width semantics. */

import { ArcError } from "../kernel/index.js";

/** Manifest, lockfile, and loaded-module evidence for Markdown dependencies. */
export interface MarkdownDependencyAlignmentInput {
  readonly rootManifest: unknown;
  readonly packageManifest: unknown;
  readonly lockfile: unknown;
  readonly runtimeVersions: {
    readonly markdownlint: string;
    readonly stringWidth: string;
  };
}

/** One aligned pair of versions used by Markdown linting and rendering. */
export interface MarkdownDependencyVersions {
  readonly markdownlint: string;
  readonly stringWidth: string;
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

  return { markdownlint, stringWidth };
}
