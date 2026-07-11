import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

describe("provider-neutral attestation guidance", () => {
  it("gives every satisfying local mechanism the same full-rubric input/output contract", async () => {
    const content = await readFile(
      fileURLToPath(new URL("../../../../.github/review-gate-attestation.md", import.meta.url)),
      "utf8",
    );
    for (const mechanism of ["Codex CLI", "Claude Code", "CodeRabbit CLI", "qualified human"]) {
      expect(content).toContain(`| ${mechanism} |`);
    }
    expect(content).toContain("independent-analysis/v1");
    expect(content).toContain("full current change set");
    expect(content).not.toMatch(/codex review|claude review|coderabbit review/iu);
  });
});
