import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
  admitSelfHostingGuidanceCarrier,
  SELF_HOSTING_REVIEW_CHECKLIST_BLOCK,
} from "../../src/scripts/review-gate/policy/self-hosting/guidance.js";

describe("provider-neutral attestation guidance", () => {
  it("gives every satisfying local mechanism the same full-rubric input/output contract", async () => {
    const content = await readFile(
      fileURLToPath(new URL("../../../../.github/review-gate-attestation.md", import.meta.url)),
      "utf8",
    );
    for (const mechanism of ["Codex CLI", "Claude Code", "CodeRabbit CLI", "qualified human"]) {
      expect(content).toMatch(new RegExp(`\\| ${mechanism}\\s+\\|`, "u"));
    }
    expect(content).toContain("standard-review/v1");
    expect(content).toContain("full current change set");
    expect(content).not.toMatch(/codex review|claude review|coderabbit review/iu);
    expect(content).toContain(SELF_HOSTING_REVIEW_CHECKLIST_BLOCK);
    expect(admitSelfHostingGuidanceCarrier("local-attestation", content)).toMatchObject({
      carrierId: "local-attestation",
      admitted: true,
      guidanceDigest: expect.stringMatching(/^sha256:[0-9a-f]{64}$/u),
    });
  });
});
