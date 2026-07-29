import { describe, expect, it } from "vitest";

import { canonicalDigest, canonicalize } from "../../../src/lib/canonical/canonical-json.js";
import { receiptId } from "../../../src/lib/canonical/receipt-id.js";
import type { RetirementReceipt } from "../../../src/lib/work-unit/retirement-authority.js";
import {
  parseRetirementRecord,
  parseRetirementReceipt,
  parseRetirementReceiptRecord,
} from "../../../src/lib/work-unit/retirement-receipt-codec.js";
import { v3DecompositionEvidenceFixture } from "../../fixtures/decompose-v3.js";

const digest = (label: string) => canonicalDigest(label);

function receiptFor(
  subject: RetirementReceipt["subject"] = { kind: "work-unit", name: "sample" },
  transition: RetirementReceipt["transition"] = "abandon",
  result: RetirementReceipt["result"] = { kind: "discard", artifactDigest: "absent" },
): RetirementReceipt {
  const source = {
    branch: "plan/sample",
    head: "a".repeat(40),
    artifactDigest: digest("source"),
  };
  return {
    schemaVersion: 1,
    receiptId: receiptId({
      schemaVersion: 1,
      subject,
      transition,
      sourceBranch: source.branch,
      sourceHead: source.head,
    }),
    subject,
    transition,
    source,
    transitionPatchDigest: digest("patch"),
    retiringProjection: { kind: "direct-transition" },
    authorization: transition === "rename"
      ? "identity-renamed"
      : transition === "park-planning"
        ? "planning-relocated"
        : "discard-confirmed",
    result,
  };
}

function contentOf(receipt: RetirementReceipt): string {
  return canonicalize(receipt);
}

function candidate(receipt: RetirementReceipt): Record<string, unknown> {
  return JSON.parse(contentOf(receipt)) as Record<string, unknown>;
}

describe("parseRetirementReceipt", () => {
  const renameReceipt = (): RetirementReceipt => receiptFor(
    { kind: "work-unit", name: "sample" },
    "rename",
    { kind: "rename", targetSlug: "renamed-sample", artifactDigest: digest("renamed") },
  );

  it("accepts canonical receipts for every closed subject and result arm", () => {
    const parkedAbandon = receiptFor({ kind: "work-unit", name: "sample" });
    parkedAbandon.retiringProjection = { kind: "unchanged" };
    const receipts = [
      receiptFor({ kind: "work-unit", name: "sample" }),
      parkedAbandon,
      receiptFor({ kind: "errand", slug: "sample" }),
      receiptFor({ kind: "branch", ref: "plan/sample" }),
      receiptFor({ kind: "work-unit", name: "sample" }, "park-planning", {
        kind: "relocate",
        plannedArtifactDigest: digest("planned"),
      }),
    ];

    for (const receipt of receipts) {
      expect(parseRetirementReceipt(contentOf(receipt))).toEqual(receipt);
    }
  });

  it("accepts exact v2 receipts with required inventory quality and versioned identity", () => {
    const v1 = receiptFor();
    const v2: RetirementReceipt = {
      ...v1,
      schemaVersion: 2,
      inventoryRead: "reachable",
      receiptId: receiptId({
        schemaVersion: 2,
        subject: v1.subject,
        transition: v1.transition,
        sourceBranch: v1.source.branch,
        sourceHead: v1.source.head,
      }),
    };

    expect(parseRetirementReceipt(contentOf(v2))).toEqual(v2);
    const missingQuality = candidate(v2);
    delete missingQuality.inventoryRead;
    expect(parseRetirementReceipt(canonicalize(missingQuality))).toBeNull();

    const nonApplicableWorkUnit = candidate(v2);
    nonApplicableWorkUnit.inventoryRead = "not-applicable";
    expect(parseRetirementReceipt(canonicalize(nonApplicableWorkUnit))).toBeNull();
  });

  it("refuses legacy decomposition receipts without weakening retained receipt versions", () => {
    const retained = receiptFor();
    const legacyResult = {
      kind: "decompose",
      preparationId: digest("preparation"),
      allocation: { schemaVersion: 2 },
      cutMapDigest: digest("cut-map"),
      sourceInventoryDigest: digest("source-inventory"),
      incomingEdgeInventoryDigest: digest("incoming-inventory"),
      outgoingEdgeInventoryDigest: digest("outgoing-inventory"),
      targets: [],
    };
    const legacy = {
      ...retained,
      transition: "decompose",
      retiringProjection: { kind: "unchanged" },
      result: legacyResult,
      receiptId: receiptId({
        schemaVersion: 1,
        subject: retained.subject,
        transition: "decompose",
        sourceBranch: retained.source.branch,
        sourceHead: retained.source.head,
      }),
    };
    const legacyV2 = {
      ...legacy,
      schemaVersion: 2,
      inventoryRead: "reachable",
      receiptId: receiptId({
        schemaVersion: 2,
        subject: legacy.subject,
        transition: "decompose",
        sourceBranch: legacy.source.branch,
        sourceHead: legacy.source.head,
      }),
    };

    expect(parseRetirementReceipt(canonicalize(legacy))).toBeNull();
    expect(parseRetirementReceipt(canonicalize(legacyV2))).toBeNull();
    expect(parseRetirementReceipt(contentOf(retained))).toEqual(retained);
  });

  it.each([
    ["malformed JSON", "{"],
    ["a JSON primitive", "null"],
    ["non-canonical whitespace", " {\"schemaVersion\":1} "],
  ])("returns null for %s", (_label, content) => {
    expect(parseRetirementReceipt(content)).toBeNull();
  });

  it("rejects unknown or missing top-level fields and unsupported schema versions", () => {
    const unknown = candidate(receiptFor());
    unknown.extra = true;
    expect(parseRetirementReceipt(canonicalize(unknown))).toBeNull();

    const missing = candidate(receiptFor());
    delete missing.result;
    expect(parseRetirementReceipt(canonicalize(missing))).toBeNull();

    const wrongVersion = candidate(receiptFor());
    wrongVersion.schemaVersion = 3;
    expect(parseRetirementReceipt(canonicalize(wrongVersion))).toBeNull();
  });

  it("rejects non-closed nested shapes and invalid source values", () => {
    const subject = candidate(receiptFor());
    subject.subject = { kind: "work-unit", name: "sample", extra: true };
    expect(parseRetirementReceipt(canonicalize(subject))).toBeNull();

    const source = candidate(receiptFor());
    source.source = { branch: "", head: "a", artifactDigest: digest("source") };
    expect(parseRetirementReceipt(canonicalize(source))).toBeNull();

    const projection = candidate(receiptFor());
    projection.retiringProjection = { kind: "unchanged", extra: true };
    expect(parseRetirementReceipt(canonicalize(projection))).toBeNull();

    const authorization = candidate(receiptFor());
    authorization.authorization = "merged-preserved";
    expect(parseRetirementReceipt(canonicalize(authorization))).toBeNull();
  });

  it("requires the receipt ID to be derived from the exact identity tuple", () => {
    const invalid = candidate(receiptFor());
    invalid.receiptId = digest("not-the-derived-id");
    expect(parseRetirementReceipt(canonicalize(invalid))).toBeNull();
  });

  it("decodes a canonical rename receipt to its fully narrowed value", () => {
    const rename = renameReceipt();

    expect(parseRetirementReceipt(contentOf(rename))).toEqual(rename);
  });

  it.each([
    ["extra key", { kind: "rename", targetSlug: "renamed-sample", artifactDigest: digest("renamed"), extra: true }],
    ["missing key", { kind: "rename", targetSlug: "renamed-sample" }],
    ["malformed slug", { kind: "rename", targetSlug: "../renamed", artifactDigest: digest("renamed") }],
  ])("rejects a rename result with an %s", (_label, result) => {
    const invalid = candidate(renameReceipt());
    invalid.result = result;

    expect(parseRetirementReceipt(canonicalize(invalid))).toBeNull();
  });

  it("rejects rename cross-field and projection mismatches", () => {
    const unchanged = candidate(renameReceipt());
    unchanged.retiringProjection = { kind: "unchanged" };
    expect(parseRetirementReceipt(canonicalize(unchanged))).toBeNull();

    const shippedAuthorization = candidate(renameReceipt());
    shippedAuthorization.authorization = "discard-confirmed";
    expect(parseRetirementReceipt(canonicalize(shippedAuthorization))).toBeNull();
  });

  it("rejects non-canonical rename JSON and a rename receipt ID derived from other fields", () => {
    const rename = renameReceipt();

    expect(parseRetirementReceipt(`${contentOf(rename)}\n`)).toBeNull();
    const invalidId = candidate(rename);
    invalidId.receiptId = digest("wrong-rename-id");
    expect(parseRetirementReceipt(canonicalize(invalidId))).toBeNull();
  });

  it.each([
    ["abandon relocation", "abandon", "planning-relocated", "relocate", "direct-transition"],
    ["park discard", "park-planning", "discard-confirmed", "discard", "direct-transition"],
  ] as const)("rejects the incoherent %s matrix", (_label, transition, authorization, resultKind, projection) => {
    const base = candidate(receiptFor(
      { kind: "work-unit", name: "sample" },
      transition,
      transition === "park-planning"
        ? { kind: "relocate", plannedArtifactDigest: digest("planned") }
        : { kind: "discard", artifactDigest: "absent" },
    ));
    base.authorization = authorization;
    base.retiringProjection = { kind: projection };
    if (resultKind === "relocate") {
      base.result = { kind: "relocate", plannedArtifactDigest: digest("planned") };
    } else if (resultKind === "discard") {
      base.result = { kind: "discard", artifactDigest: "absent" };
    }
    expect(parseRetirementReceipt(canonicalize(base))).toBeNull();
  });
});

describe("parseRetirementReceiptRecord", () => {
  it("discriminates canonical v3 decomposition from retained receipts", () => {
    const retained = receiptFor();
    const { receipt: decomposition } = v3DecompositionEvidenceFixture();

    expect(parseRetirementReceiptRecord(contentOf(retained))).toEqual({
      kind: "retained",
      receipt: retained,
    });
    expect(parseRetirementReceiptRecord(canonicalize(decomposition))).toEqual({
      kind: "v3-decomposition",
      receipt: decomposition,
    });
  });

  it("refuses malformed v3 authority without falling through to retained decoding", () => {
    const { receipt } = v3DecompositionEvidenceFixture();
    const tampered = structuredClone(receipt);
    tampered.finalized.destinationDigests[0]!.digest = digest("forged");

    expect(parseRetirementReceiptRecord(canonicalize(tampered))).toBeNull();
    expect(parseRetirementReceiptRecord(canonicalize({ ...receipt, schemaVersion: 2 }))).toBeNull();
  });

  it("refuses a valid preparation as finalized receipt authority", () => {
    const { preparation } = v3DecompositionEvidenceFixture();

    expect(parseRetirementReceiptRecord(canonicalize(preparation))).toBeNull();
  });
});

describe("parseRetirementRecord", () => {
  it("returns only the three closed authenticated namespace arms", () => {
    const retained = receiptFor();
    const { preparation, receipt } = v3DecompositionEvidenceFixture();

    expect(parseRetirementRecord(contentOf(retained))).toEqual({
      kind: "retained",
      receipt: retained,
    });
    expect(parseRetirementRecord(canonicalize(preparation))).toEqual({
      kind: "v3-decomposition-preparation",
      preparation,
    });
    expect(parseRetirementRecord(canonicalize(receipt))).toEqual({
      kind: "v3-decomposition",
      receipt,
    });
  });
});
