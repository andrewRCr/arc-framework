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
