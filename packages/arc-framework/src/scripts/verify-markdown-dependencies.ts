/** Worktree loader for the shared Markdown dependency-alignment check. */

import { existsSync, readFileSync } from "node:fs";
import { dirname, join, parse } from "node:path";
import { fileURLToPath } from "node:url";

import { getVersion as getMarkdownlintVersion } from "markdownlint";
import stringWidth from "string-width";

import { assertMarkdownDependencyAlignment } from "../lib/markdown/index.js";
import type { MarkdownDependencyVersions } from "../lib/markdown/dependency-alignment.js";
import { resolveRepoRoot } from "./repo-root.js";

function readJson(path: string): unknown {
  return JSON.parse(readFileSync(path, "utf8")) as unknown;
}

function importedPackageVersion(entryPath: string, packageName: string): string {
  let directory = dirname(entryPath);
  const filesystemRoot = parse(directory).root;
  while (directory !== filesystemRoot) {
    const manifestPath = join(directory, "package.json");
    if (existsSync(manifestPath)) {
      const manifest = readJson(manifestPath);
      if (typeof manifest === "object" && manifest !== null && !Array.isArray(manifest)) {
        const fields = manifest as Record<string, unknown>;
        if (fields.name === packageName && typeof fields.version === "string") return fields.version;
      }
    }
    directory = dirname(directory);
  }
  throw new Error(`Unable to resolve the imported ${packageName} package version`);
}

/** Return versions from the implementations imported by the Markdown tooling process. */
export function markdownRuntimeVersions(): MarkdownDependencyVersions {
  stringWidth("");
  return {
    markdownlint: getMarkdownlintVersion(),
    stringWidth: importedPackageVersion(fileURLToPath(import.meta.resolve("string-width")), "string-width"),
  };
}

/** Verify the current worktree manifests, lockfile, and imported Markdown dependency versions. */
export function verifyMarkdownDependencies(root: string): void {
  assertMarkdownDependencyAlignment({
    rootManifest: readJson(join(root, "package.json")),
    packageManifest: readJson(join(root, "packages/arc-framework/package.json")),
    lockfile: readJson(join(root, "package-lock.json")),
    runtimeVersions: markdownRuntimeVersions(),
  });
}

function main(): void {
  verifyMarkdownDependencies(resolveRepoRoot());
}

if (fileURLToPath(import.meta.url) === process.argv[1]) main();
