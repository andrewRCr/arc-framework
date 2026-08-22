import { describe, expect, it } from "vitest";

import {
  V3ExtractionFinishResultSchema,
} from "../../../src/lib/work-unit/decompose-v3-finish.js";

describe("V3ExtractionFinishResultSchema", () => {
  const preview = {
    liveBase: {
      ref: "refs/heads/main",
      head: "a".repeat(40),
      destinations: [{
        path: ".arc/backlog/planned/member/meta-member.md",
        mode: "100644",
        contentDigest: `sha256:${"b".repeat(64)}`,
      }],
    },
    sources: [{
      path: ".arc/active/spec-origin.md",
      after: {
        kind: "file",
        mode: "100644",
        contentBase64: Buffer.from("retained\n", "utf8").toString("base64"),
      },
      removedLocators: [{ artifact: "spec-origin.md", kind: "preamble" }],
    }],
  };

  it.each([
    { status: "previewed", preview },
    { status: "finished" },
    { status: "already-finished" },
    { status: "refused", reason: "destination-missing", locus: "member" },
  ])("accepts one canonical finish outcome: %o", (result) => {
    expect(V3ExtractionFinishResultSchema.safeParse(result).success).toBe(true);
  });

  it.each([
    { status: "refused" },
    { status: "unknown" },
    { status: "previewed" },
    { status: "previewed", reason: "unexpected" },
  ])("refuses an incomplete or open-ended outcome: %o", (result) => {
    expect(V3ExtractionFinishResultSchema.safeParse(result).success).toBe(false);
  });
});
