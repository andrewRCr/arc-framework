/**
 * Regression coverage for hook-internal shell-script invocation.
 *
 * Fresh clones may preserve tracked hook files without executable bits. The
 * pre-commit hook must invoke nested shell scripts through `bash` so CHECK 13
 * still runs even when `validate-links.sh` itself is not executable.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const repoRoot = join(__dirname, "..", "..", "..", "..", "..");

const preCommitSource = readFileSync(
  join(repoRoot, "packages/arc-framework/arc/system/.internal/githooks/pre-commit"),
  "utf-8",
);

describe("pre-commit hook shell-script invocation", () => {
  it("invokes validate-links.sh via bash instead of relying on the exec bit", () => {
    expect(preCommitSource).toMatch(
      /bash "\$\((?:dirname )?"\$0"\)\/\.\.\/scripts\/validate-links\.sh"/,
    );
  });

  it("does not directly execute nested .sh scripts", () => {
    const directShellInvocations = preCommitSource
      .split("\n")
      .filter((line) => {
        const trimmed = line.trim();
        return trimmed.includes("../scripts/")
          && trimmed.includes(".sh")
          && !trimmed.startsWith(". ")
          && !trimmed.includes('bash "$(dirname "$0")/../scripts/');
      });

    expect(directShellInvocations).toEqual([]);
  });
});

describe("foreign-write advisory backstop wiring", () => {
  it("invokes the foreign-write entry point via npx tsx", () => {
    expect(preCommitSource).toContain(
      "npx tsx packages/arc-framework/src/scripts/check-foreign-writes.ts",
    );
  });

  it("treats the backstop as advisory — increments warnings, never errors", () => {
    // The foreign-write block runs between the ROADMAP assert and the Summary.
    const block = preCommitSource.slice(
      preCommitSource.indexOf("CHECK 21"),
      preCommitSource.indexOf("# Summary"),
    );
    expect(block).toContain("warnings=$((warnings + 1))");
    expect(block).not.toContain("errors=$((errors + 1))");
  });

  it("uses neutral wording for foreign-write and skip-note output", () => {
    expect(preCommitSource).toContain("Warning: In-flight artifact advisory:");
    expect(preCommitSource).not.toContain("Warning: Foreign-owned write among staged artifacts:");
  });
});

describe("decompose retirement record gate wiring", () => {
  it("invokes the finalized-record validator as an error gate", () => {
    const block = preCommitSource.slice(
      preCommitSource.indexOf("CHECK 20"),
      preCommitSource.indexOf("CHECK 21"),
    );
    expect(block).toContain("npx tsx packages/arc-framework/src/scripts/validate-decompose-record.ts");
    expect(block).toContain("errors=$((errors + 1))");
  });
});

describe("ROADMAP regeneration assert wiring", () => {
  it("invokes the ROADMAP assert entry point via npx tsx", () => {
    expect(preCommitSource).toContain(
      "npx tsx packages/arc-framework/src/scripts/assert-roadmap-regenerated.ts",
    );
  });

  it("treats rejection output as an error and indeterminate output as a warning", () => {
    const block = preCommitSource.slice(
      preCommitSource.indexOf("CHECK 19"),
      preCommitSource.indexOf("CHECK 20"),
    );

    expect(block).toContain("errors=$((errors + 1))");
    expect(block).toContain("warnings=$((warnings + 1))");
    expect(block).toContain("roadmap_assert_output");
  });

  it("documents the local-hook boundary for GitHub-side merges", () => {
    const block = preCommitSource.slice(
      preCommitSource.indexOf("CHECK 19"),
      preCommitSource.indexOf("CHECK 20"),
    );

    expect(block).toContain("GitHub-side conflict resolution does not run local hooks");
  });
});
