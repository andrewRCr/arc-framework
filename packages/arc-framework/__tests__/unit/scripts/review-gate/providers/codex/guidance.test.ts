import { describe, expect, it } from "vitest";

import {
  resolveCodexGuidance,
  type CodexGuidanceObjectReader,
} from "../../../../../../src/scripts/review-gate/providers/codex/guidance.js";
import {
  STANDARD_REVIEW_BASELINE_CONTRACT,
  STANDARD_REVIEW_RUBRIC_IDENTITY,
} from "../../../../../../src/scripts/review-gate/policy/standard-review.js";
import {
  SELF_HOSTING_REVIEW_GUIDANCE_BLOCK,
} from "../../../../../../src/scripts/review-gate/policy/self-hosting/guidance.js";

const HEAD = "a".repeat(40);
const ROOT = `# Agent Bootstrap

## Review guidelines

${SELF_HOSTING_REVIEW_GUIDANCE_BLOCK}
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
      rubricVersion: "standard-review/v1",
      targets: ["packages/a.ts", "packages/old.ts"],
      guidancePaths: ["AGENTS.md"],
      baseline: STANDARD_REVIEW_BASELINE_CONTRACT,
      projectAugmentation: [{ path: "AGENTS.md", content: ROOT }],
      rubricDigest: STANDARD_REVIEW_RUBRIC_IDENTITY.digest,
      guidanceDigest: "sha256:2870b060bd1bf7686f0833f3f33c1d3171b0912186897d46a32d907aed1dac46",
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

  it("accepts inherited and identically repeated effective guidance", async () => {
    const inherited = await resolveCodexGuidance({
      headSha: HEAD,
      changes: [{ status: "modified", path: "src/a.ts" }],
      reader: reader({ "AGENTS.md": ROOT }),
    });
    const repeated = await resolveCodexGuidance({
      headSha: HEAD,
      changes: [{ status: "modified", path: "src/a.ts" }],
      reader: reader({ "AGENTS.md": ROOT, "src/AGENTS.md": ROOT }),
    });

    expect(inherited.qualified).toBe(true);
    expect(repeated.qualified).toBe(true);
  });

  it("rejects a stale managed projection in the effective nested set", async () => {
    const result = await resolveCodexGuidance({
      headSha: HEAD,
      changes: [{ status: "modified", path: "src/a.ts" }],
      reader: reader({
        "AGENTS.md": ROOT,
        "src/AGENTS.md": ROOT.replace("Stable locus", "Approximate locus"),
      }),
    });

    expect(result).toEqual({ qualified: false, reasons: ["review-guidelines-stale:src/AGENTS.md"] });
  });

  it("changes the forward identity when exact project augmentation changes", async () => {
    const baseline = await resolveCodexGuidance({
      headSha: HEAD,
      changes: [{ status: "modified", path: "src/a.ts" }],
      reader: reader({ "AGENTS.md": ROOT }),
    });
    const augmented = await resolveCodexGuidance({
      headSha: HEAD,
      changes: [{ status: "modified", path: "src/a.ts" }],
      reader: reader({
        "AGENTS.md": ROOT,
        "src/AGENTS.md": "# Project instructions\n\nCheck generated fixtures.\n",
      }),
    });
    if (!baseline.qualified || !augmented.qualified) throw new Error("expected qualified guidance");

    expect(augmented.guidanceDigest).not.toBe(baseline.guidanceDigest);
    expect(augmented.rubricDigest).toBe(baseline.rubricDigest);
    expect(augmented.projectAugmentation).toHaveLength(2);
  });

  it.each([
    ["missing root", {}, HEAD, "missing-guidance:AGENTS.md"],
    ["wrong head", { "AGENTS.md": ROOT }, "b".repeat(40), "guidance-head-mismatch:AGENTS.md"],
    ["missing rubric", { "AGENTS.md": "# Agent Bootstrap\n" }, HEAD, "review-guidelines-missing:AGENTS.md"],
    ["stale projection", { "AGENTS.md": ROOT.replace("Stable locus", "Approximate locus") }, HEAD,
      "review-guidelines-stale:AGENTS.md"],
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
