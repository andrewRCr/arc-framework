import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import {
  admitSelfHostingGuidanceCarrier,
  SELF_HOSTING_REVIEW_GUIDANCE_BLOCK,
} from "../../src/scripts/review-gate/policy/self-hosting/guidance.js";

const root = resolve(import.meta.dirname, "../../../..");

describe("self-hosting guidance carriers", () => {
  it("admits the generated hosted-codex managed block", async () => {
    const content = await readFile(resolve(root, "AGENTS.md"), "utf8");

    expect(content).toContain(SELF_HOSTING_REVIEW_GUIDANCE_BLOCK);
    expect(admitSelfHostingGuidanceCarrier("hosted-codex", content)).toMatchObject({
      carrierId: "hosted-codex",
      admitted: true,
      guidanceDigest: expect.stringMatching(/^sha256:[0-9a-f]{64}$/u),
    });
  });

  it("records missing, stale, and conflicting managed projections as rejected", () => {
    expect(admitSelfHostingGuidanceCarrier("hosted-codex", "# no guidance\n")).toMatchObject({
      admitted: false,
      reason: "managed-guidance-missing",
    });
    expect(admitSelfHostingGuidanceCarrier(
      "hosted-codex",
      SELF_HOSTING_REVIEW_GUIDANCE_BLOCK.replace("Stable locus", "Approximate locus"),
    )).toMatchObject({ admitted: false, reason: "managed-guidance-stale" });
    expect(admitSelfHostingGuidanceCarrier(
      "hosted-codex",
      `${SELF_HOSTING_REVIEW_GUIDANCE_BLOCK}\n${SELF_HOSTING_REVIEW_GUIDANCE_BLOCK}`,
    )).toMatchObject({ admitted: false, reason: "managed-guidance-conflicting" });
  });
});
