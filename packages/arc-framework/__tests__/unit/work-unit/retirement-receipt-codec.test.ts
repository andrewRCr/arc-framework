import { describe, expect, it } from "vitest";

import { canonicalDigest, canonicalize } from "../../../src/lib/canonical/canonical-json.js";
import { receiptId } from "../../../src/lib/canonical/receipt-id.js";
import { parseCutMap, type DecomposeAllocationMap } from "../../../src/lib/work-unit/decompose-cut-map.js";
import type { RetirementReceipt } from "../../../src/lib/work-unit/retirement-authority.js";
import { parseRetirementReceipt } from "../../../src/lib/work-unit/retirement-receipt-codec.js";

const digest = (label: string) => canonicalDigest(label);

const allocationInput = {
  schemaVersion: 2,
  origin: { slug: "origin-wu", phase: "Planning", location: "planned" },
  shape: "symmetric",
  parentPosition: "standalone",
  cohort: "my-cohort",
  entries: [
    { kind: "new-member", destinationId: "member-b", slug: "member-b", workClass: "Light" },
    { kind: "new-member", destinationId: "member-a", slug: "member-a", workClass: "Heavy" },
  ],
  internalEdges: [],
  sourceAllocations: [],
  incomingEdges: [],
  outgoingEdges: [],
};

const allocationResult = parseCutMap(allocationInput);
if (allocationResult.status !== "parsed") throw new Error(allocationResult.reason);
const allocation: DecomposeAllocationMap = allocationResult.params;

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
    retiringProjection: { kind: transition === "decompose" ? "unchanged" : "direct-transition" },
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
    const receipts = [
      receiptFor({ kind: "work-unit", name: "sample" }),
      receiptFor({ kind: "errand", slug: "sample" }),
      receiptFor({ kind: "errand", slug: "sample", claimId: "a".repeat(32) }),
      receiptFor({ kind: "groom", slug: "sample", claimId: "b".repeat(32) }),
      receiptFor({ kind: "housekeep", slug: "sample", claimId: "c".repeat(32) }),
      receiptFor({ kind: "branch", ref: "plan/sample" }),
      receiptFor({ kind: "work-unit", name: "sample" }, "park-planning", {
        kind: "relocate",
        plannedArtifactDigest: digest("planned"),
      }),
      receiptFor({ kind: "work-unit", name: "sample" }, "decompose", {
        kind: "decompose",
        preparationId: digest("preparation"),
        allocation,
        cutMapDigest: digest("cut-map"),
        sourceInventoryDigest: digest("source-inventory"),
        incomingEdgeInventoryDigest: digest("incoming-inventory"),
        outgoingEdgeInventoryDigest: digest("outgoing-inventory"),
        targets: [
          { path: ".arc/backlog/planned/my-cohort/member-a/meta-member-a.md", artifactDigest: digest("target-a") },
          { path: ".arc/backlog/planned/my-cohort/member-b/meta-member-b.md", artifactDigest: digest("target-b") },
        ],
      }),
    ];

    for (const receipt of receipts) {
      expect(parseRetirementReceipt(contentOf(receipt))).toEqual(receipt);
    }
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
    wrongVersion.schemaVersion = 2;
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

  it.each([
    { kind: "groom", slug: "sample" },
    { kind: "housekeep", slug: "sample", claimId: "short" },
    { kind: "errand", slug: "sample", claimId: "a".repeat(32), extra: true },
    { kind: "future", slug: "sample", claimId: "a".repeat(32) },
  ])("rejects incomplete, illegal, or unknown transient subject %#", (subject) => {
    const invalid = candidate(receiptFor());
    invalid.subject = subject;
    invalid.receiptId = receiptId({
      schemaVersion: 1,
      subject: subject as RetirementReceipt["subject"],
      transition: "abandon",
      sourceBranch: "plan/sample",
      sourceHead: "a".repeat(40),
    });
    expect(parseRetirementReceipt(canonicalize(invalid))).toBeNull();
  });

  it("requires decompose allocations and targets to be canonical closed values", () => {
    const base = receiptFor({ kind: "work-unit", name: "sample" }, "decompose", {
      kind: "decompose",
      preparationId: digest("preparation"),
      allocation,
      cutMapDigest: digest("cut-map"),
      sourceInventoryDigest: digest("source-inventory"),
      incomingEdgeInventoryDigest: digest("incoming-inventory"),
      outgoingEdgeInventoryDigest: digest("outgoing-inventory"),
      targets: [
        { path: "a.md", artifactDigest: digest("a") },
        { path: "b.md", artifactDigest: digest("b") },
      ],
    });

    const unsortedAllocation = candidate(base);
    const unsortedResult = unsortedAllocation.result as Record<string, unknown>;
    unsortedResult.allocation = {
      ...allocation,
      entries: [...allocation.entries].reverse(),
    };
    expect(parseRetirementReceipt(canonicalize(unsortedAllocation))).toBeNull();

    const unsortedTargets = candidate(base);
    const targetResult = unsortedTargets.result as Record<string, unknown>;
    targetResult.targets = [
      { path: "b.md", artifactDigest: digest("b") },
      { path: "a.md", artifactDigest: digest("a") },
    ];
    expect(parseRetirementReceipt(canonicalize(unsortedTargets))).toBeNull();

    const duplicateTargets = candidate(base);
    const duplicateResult = duplicateTargets.result as Record<string, unknown>;
    duplicateResult.targets = [
      { path: "a.md", artifactDigest: digest("a") },
      { path: "a.md", artifactDigest: digest("other") },
    ];
    expect(parseRetirementReceipt(canonicalize(duplicateTargets))).toBeNull();
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
    ["decompose direct projection", "decompose", "discard-confirmed", "decompose", "direct-transition"],
  ] as const)("rejects the incoherent %s matrix", (_label, transition, authorization, resultKind, projection) => {
    const base = candidate(receiptFor(
      { kind: "work-unit", name: "sample" },
      transition,
      transition === "decompose"
        ? {
            kind: "decompose",
            preparationId: digest("preparation"),
            allocation,
            cutMapDigest: digest("cut-map"),
            sourceInventoryDigest: digest("source-inventory"),
            incomingEdgeInventoryDigest: digest("incoming-inventory"),
            outgoingEdgeInventoryDigest: digest("outgoing-inventory"),
            targets: [],
          }
        : transition === "park-planning"
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
