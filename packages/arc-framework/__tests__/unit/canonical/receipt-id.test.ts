import { describe, expect, it } from "vitest";

import { canonicalize } from "../../../src/lib/canonical/canonical-json.js";
import { type ArtifactSetEntry, contentDigest } from "../../../src/lib/canonical/content-digest.js";
import { validateManagedPath } from "../../../src/lib/canonical/managed-path.js";
import {
  DISCARD_RESULT,
  type ReceiptIdInput,
  artifactGroupDigest,
  preparationId,
  receiptId,
} from "../../../src/lib/canonical/receipt-id.js";
import type { WorktreeSubject } from "../../../src/lib/git/worktree-marker.js";

const encode = (text: string): Uint8Array => new TextEncoder().encode(text);

const baseReceipt: ReceiptIdInput = {
  schemaVersion: 1,
  subject: { kind: "work-unit", name: "husk-lifecycle-drivers" },
  transition: "abandon",
  sourceBranch: "plan/husk-lifecycle-drivers",
  sourceHead: "a".repeat(40),
};

describe("receiptId", () => {
  it("is deterministic and idempotent for identical inputs", () => {
    expect(receiptId(baseReceipt)).toMatch(/^sha256:[0-9a-f]{64}$/u);
    expect(receiptId({ ...baseReceipt })).toBe(receiptId(baseReceipt));
  });

  it("anchors a cross-environment golden digest", () => {
    expect(receiptId(baseReceipt)).toBe("sha256:1c3c41a562810b3b1b017faa2848be8746cfd020e8f0ddd932ea2d52b4b47e43");
  });

  it.each<[string, ReceiptIdInput]>([
    ["schemaVersion", { ...baseReceipt, schemaVersion: 2 }],
    ["subject name", { ...baseReceipt, subject: { kind: "work-unit", name: "other" } }],
    ["transition", { ...baseReceipt, transition: "park-planning" }],
    ["sourceBranch", { ...baseReceipt, sourceBranch: "plan/other" }],
    ["sourceHead", { ...baseReceipt, sourceHead: "b".repeat(40) }],
  ])("changes when %s changes", (_label, changed) => {
    expect(receiptId(changed)).not.toBe(receiptId(baseReceipt));
  });

  it("distinguishes subject kind even when the text suffix matches", () => {
    const asWorkUnit: WorktreeSubject = { kind: "work-unit", name: "shared" };
    const asBranch: WorktreeSubject = { kind: "branch", ref: "shared" };

    expect(receiptId({ ...baseReceipt, subject: asWorkUnit })).not.toBe(
      receiptId({ ...baseReceipt, subject: asBranch }),
    );
  });
});

describe("preparationId", () => {
  const basePrep = {
    receiptId: receiptId(baseReceipt),
    baseHead: "c".repeat(40),
    sourceInventoryDigest: contentDigest(encode("source")),
    incomingEdgeInventoryDigest: contentDigest(encode("incoming")),
    outgoingEdgeInventoryDigest: contentDigest(encode("outgoing")),
    cutMapDigest: contentDigest(encode("cutmap")),
  } as const;

  it("is deterministic and idempotent for identical inputs", () => {
    expect(preparationId(basePrep)).toMatch(/^sha256:[0-9a-f]{64}$/u);
    expect(preparationId({ ...basePrep })).toBe(preparationId(basePrep));
  });

  it.each<[string, typeof basePrep]>([
    ["receiptId", { ...basePrep, receiptId: receiptId({ ...baseReceipt, sourceHead: "f".repeat(40) }) }],
    ["baseHead", { ...basePrep, baseHead: "d".repeat(40) }],
    ["sourceInventoryDigest", { ...basePrep, sourceInventoryDigest: contentDigest(encode("source2")) }],
    ["incomingEdgeInventoryDigest", { ...basePrep, incomingEdgeInventoryDigest: contentDigest(encode("in2")) }],
    ["outgoingEdgeInventoryDigest", { ...basePrep, outgoingEdgeInventoryDigest: contentDigest(encode("out2")) }],
    ["cutMapDigest", { ...basePrep, cutMapDigest: contentDigest(encode("cut2")) }],
  ])("changes when %s changes", (_label, changed) => {
    expect(preparationId(changed)).not.toBe(preparationId(basePrep));
  });
});

describe("artifactGroupDigest", () => {
  const absent: ArtifactSetEntry = { path: validateManagedPath("a.md"), state: "absent" };
  const present: ArtifactSetEntry = {
    path: validateManagedPath("b.md"),
    state: "present",
    contentDigest: contentDigest(encode("payload")),
  };

  it("is path-sorted: input order does not change the digest", () => {
    expect(artifactGroupDigest([absent, present])).toBe(artifactGroupDigest([present, absent]));
  });

  it("differs for different artifact groups", () => {
    expect(artifactGroupDigest([absent])).not.toBe(artifactGroupDigest([present]));
    expect(artifactGroupDigest([absent, present])).not.toBe(artifactGroupDigest([absent]));
  });
});

describe("discard result", () => {
  it("uses the literal 'absent' schema value, never a computed digest", () => {
    expect(DISCARD_RESULT).toEqual({ kind: "discard", artifactDigest: "absent" });
    expect(canonicalize(DISCARD_RESULT)).toContain('"artifactDigest":"absent"');
  });
});
