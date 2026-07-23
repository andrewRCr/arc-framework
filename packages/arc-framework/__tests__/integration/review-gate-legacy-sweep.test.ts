import { readdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const repositoryRoot = resolve(import.meta.dirname, "../../../..");

async function filesBelow(relativeRoot: string): Promise<string[]> {
  const root = resolve(repositoryRoot, relativeRoot);
  const entries = await readdir(root, { recursive: true, withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile())
    .map((entry) => resolve(entry.parentPath, entry.name))
    .filter((path) => /\.(?:json|md|mjs|sh|toml|ts|yaml|yml)$/u.test(path));
}

async function matchingFiles(relativeRoots: string[], pattern: RegExp): Promise<string[]> {
  const files = (await Promise.all(relativeRoots.map((root) => filesBelow(root)))).flat();
  const matches: string[] = [];
  for (const path of files) {
    if (pattern.test(await readFile(path, "utf8"))) matches.push(path.slice(repositoryRoot.length + 1));
  }
  return matches.sort();
}

describe("retired review architecture sweep", () => {
  it("keeps retired config and method vocabulary out of live shipped and self-hosting guidance", async () => {
    await expect(matchingFiles([
      "packages/arc-framework/arc",
      ".arc/system",
      ".github",
    ], /\breview\.pre_merge\b|\bdiff-review\b/u)).resolves.toEqual([]);
  });

  it("limits planned-work references to explicitly historical baselines", async () => {
    await expect(matchingFiles([
      ".arc/backlog/planned",
    ], /\breview\.pre_merge\b|\bdiff-review\b/u)).resolves.toEqual([
      ".arc/backlog/planned/configuration/config-storage-architecture/draft-config-storage-architecture.md",
      ".arc/backlog/planned/configuration/customization-arch-realign/draft-customization-arch-realign.md",
    ]);
  });

  it("retains review-gate/v1 only in the exact legacy parser family", async () => {
    await expect(matchingFiles([
      "packages/arc-framework/src/scripts/review-gate",
    ], /review-gate\/v1/u)).resolves.toEqual([
      "packages/arc-framework/src/scripts/review-gate/core/contract-version-dispatch.ts",
      "packages/arc-framework/src/scripts/review-gate/core/execution.ts",
    ]);

    const execution = await readFile(resolve(
      repositoryRoot,
      "packages/arc-framework/src/scripts/review-gate/core/execution.ts",
    ), "utf8");
    expect(execution).toContain("LEGACY_REVIEW_SEMANTICS_VERSION");
    expect(execution).toMatch(/retained only for exact schema-v1 parsing and diagnostics/u);
  });

  it("preserves the public rubric identity while excluding superseded disposition labels", async () => {
    const [independent, triage] = await Promise.all([
      readFile(resolve(repositoryRoot, "packages/arc-framework/arc/system/methods/standard-review.md"), "utf8"),
      readFile(resolve(repositoryRoot, "packages/arc-framework/arc/system/methods/review-triage.md"), "utf8"),
    ]);
    expect(independent).toContain("standard-review/v1");
    expect(triage).toContain("`fix | defer | reject`");
    expect(triage).not.toMatch(/FIX NOW|MINOR FIX|SILENT FIX/u);
  });
});
