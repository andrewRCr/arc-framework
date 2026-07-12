import { describe, expect, it } from "vitest";

import {
  resolveCodexGuidance,
  type CodexGuidanceObjectReader,
} from "../../../../../../src/scripts/review-gate/providers/codex/guidance.js";

const HEAD = "a".repeat(40);
const ROOT = `# Agent Bootstrap

## Review guidelines

Rubric: independent-analysis/v1

- Intent and scope
- Correctness and failure behavior
- Trust and compatibility
- Verification
- Coherence and maintainability
`;

function reader(files: Record<string, string>, observedHeadSha = HEAD): CodexGuidanceObjectReader {
  return {
    readText: async (_headSha, path) => files[path] === undefined
      ? { kind: "missing" }
      : { kind: "ok", observedHeadSha, content: files[path] },
  };
}

describe("Codex exact-head review guidance", () => {
  it("binds one rubric-bearing effective guidance digest to every changed path", async () => {
    const result = await resolveCodexGuidance({
      headSha: HEAD,
      changes: [
        { status: "modified", path: "packages/a.ts" },
        { status: "deleted", path: "packages/old.ts" },
      ],
      reader: reader({ "AGENTS.md": ROOT }),
    });

    expect(result).toMatchObject({
      qualified: true,
      headSha: HEAD,
      rubricVersion: "independent-analysis/v1",
      targets: ["packages/a.ts", "packages/old.ts"],
      guidancePaths: ["AGENTS.md"],
      digest: expect.stringMatching(/^[a-f0-9]{64}$/u),
    });
  });

  it("checks both sides of a rename and rejects conflicting nested guidance", async () => {
    const result = await resolveCodexGuidance({
      headSha: HEAD,
      changes: [{ status: "renamed", path: "new/a.ts", previousPath: "old/a.ts" }],
      reader: reader({
        "AGENTS.md": ROOT,
        "new/AGENTS.md": `${ROOT}\nReview only generated output.\n`,
      }),
    });

    expect(result).toEqual({ qualified: false, reasons: ["conflicting-effective-guidance"] });
  });

  it.each([
    ["missing root", {}, HEAD, "missing-guidance:AGENTS.md"],
    ["wrong head", { "AGENTS.md": ROOT }, "b".repeat(40), "guidance-head-mismatch:AGENTS.md"],
    ["missing rubric", { "AGENTS.md": "# Agent Bootstrap\n" }, HEAD, "review-guidelines-missing:AGENTS.md"],
  ])("fails closed for %s", async (_name, files, observedHeadSha, reason) => {
    await expect(resolveCodexGuidance({
      headSha: HEAD,
      changes: [{ status: "modified", path: "src/a.ts" }],
      reader: reader(files, observedHeadSha),
    })).resolves.toEqual({ qualified: false, reasons: [reason] });
  });

  it("fails closed when an exact-head object read is unreadable", async () => {
    const objectReader: CodexGuidanceObjectReader = { readText: async () => ({ kind: "unreadable" }) };
    await expect(resolveCodexGuidance({
      headSha: HEAD,
      changes: [{ status: "modified", path: "src/a.ts" }],
      reader: objectReader,
    })).resolves.toEqual({ qualified: false, reasons: ["guidance-unreadable:AGENTS.md"] });
  });
});
