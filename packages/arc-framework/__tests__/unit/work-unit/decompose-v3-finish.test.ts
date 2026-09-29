import { describe, it } from "vitest";
import { assertSchemaAccepts, assertSchemaRefuses } from "../../helpers/schema-assertion.js";

import {
  V3ExtractionFinishResultSchema,
} from "../../../src/lib/work-unit/decompose-v3-finish.js";
import { spineRemedy } from "../../../src/scripts/integration/spine-refusal.js";

describe("V3ExtractionFinishResultSchema", () => {
  const preview = {
    applyAuthority: `sha256:${"c".repeat(64)}`,
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
      before: {
        mode: "100644",
        contentDigest: `sha256:${"d".repeat(64)}`,
        byteLength: 128,
      },
      after: {
        kind: "file",
        mode: "100644",
        contentBase64: Buffer.from("retained\n", "utf8").toString("base64"),
      },
      removedLocators: [{ artifact: "spec-origin.md", kind: "preamble" }],
    }],
  };
  const refusal = {
    status: "refused" as const,
    reason: "destination-missing",
    locus: "member",
    evidence: { expected: "planned", actual: { kind: "absent" } },
    remedy: spineRemedy(
      "Every planned destination must exist on the live base.",
      "Retry finish after restoring the destination",
      ["arc", "decompose", "origin", "--finish", "map.json"],
    ),
  };

  it.each([
    { status: "previewed", preview },
    { status: "finished" },
    { status: "already-finished" },
    refusal,
  ])("accepts one canonical finish outcome: %o", (result) => {
    assertSchemaAccepts(V3ExtractionFinishResultSchema, result);
  });

  it.each([
    { status: "refused" },
    { status: "refused", reason: "destination-missing", locus: "member" },
    { ...refusal, extra: true },
    { ...refusal, evidence: { expected: "planned" } },
    { status: "unknown" },
    { status: "previewed" },
    { status: "previewed", reason: "unexpected" },
    { status: "previewed", preview: { ...preview, applyAuthority: "invalid" } },
    {
      status: "previewed",
      preview: {
        ...preview,
        sources: [{
          ...preview.sources[0],
          before: {
            mode: preview.sources[0]?.before.mode,
            contentDigest: preview.sources[0]?.before.contentDigest,
          },
        }],
      },
    },
  ])("refuses an incomplete or open-ended outcome: %o", (result) => {
    assertSchemaRefuses(V3ExtractionFinishResultSchema, result);
  });
});
