import { describe, expect, it } from "vitest";

import { canonicalDigest, canonicalize } from "../../../src/lib/canonical/canonical-json.js";
import { contentDigest, patchDigest } from "../../../src/lib/canonical/content-digest.js";
import { validateManagedPath } from "../../../src/lib/canonical/managed-path.js";
import { receiptId as deriveReceiptId } from "../../../src/lib/canonical/receipt-id.js";
import { resolveRetirementRecordRelativePath } from "../../../src/lib/work-unit/retirement-record-store.js";
import {
  validateDecomposeCommitGate,
  type StagedPathChange,
} from "../../../src/scripts/validate-decompose-record.js";

const bytes = (value: string) => new TextEncoder().encode(value);
const decomposeReceiptId = canonicalDigest("receipt");
const recordPath = resolveRetirementRecordRelativePath(decomposeReceiptId);
const targetPath = validateManagedPath(".arc/backlog/planned/group/member/meta-member.md");
const targetBytes = bytes("member");
const receipt = {
  schemaVersion: 1,
  receiptId: decomposeReceiptId,
  subject: { kind: "work-unit", name: "origin" },
  transition: "decompose",
  source: { branch: "plan/origin", head: "a".repeat(40), artifactDigest: canonicalDigest("source") },
  transitionPatchDigest: patchDigest([
    { operation: "write", path: targetPath, contentDigest: contentDigest(targetBytes) },
  ]),
  retiringProjection: { kind: "unchanged" },
  authorization: "discard-confirmed",
  result: {
    kind: "decompose",
    preparationId: canonicalDigest("prep"),
    allocation: { schemaVersion: 2 },
    cutMapDigest: canonicalDigest("cut"),
    sourceInventoryDigest: canonicalDigest("source-inventory"),
    incomingEdgeInventoryDigest: canonicalDigest("incoming"),
    outgoingEdgeInventoryDigest: canonicalDigest("outgoing"),
    targets: [],
  },
};

function abandonReceipt(name: string, sourceHead = "c".repeat(40)) {
  const subject = { kind: "work-unit" as const, name };
  const sourceBranch = `plan/${name}`;
  return {
    schemaVersion: 1 as const,
    receiptId: deriveReceiptId({
      schemaVersion: 1,
      subject,
      transition: "abandon",
      sourceBranch,
      sourceHead,
    }),
    subject,
    transition: "abandon" as const,
    source: {
      branch: sourceBranch,
      head: sourceHead,
      artifactDigest: canonicalDigest({ source: name }),
    },
    transitionPatchDigest: canonicalDigest({ transition: name }),
    retiringProjection: { kind: "direct-transition" as const },
    authorization: "discard-confirmed" as const,
    result: { kind: "discard" as const, artifactDigest: "absent" as const },
  };
}

function validate(changes: StagedPathChange[], record = canonicalize(receipt), headRecord: Uint8Array | null = null) {
  return validateDecomposeCommitGate({
    changes,
    readIndexBytes: (path) => path === recordPath ? bytes(record) : path === targetPath ? targetBytes : null,
    readHeadBytes: (path) => path === recordPath ? headRecord : null,
  });
}

describe("validateDecomposeCommitGate", () => {
  it("accepts a newly finalized record whose staged patch matches", () => {
    expect(validate([{ status: "A", path: recordPath }, { status: "A", path: targetPath }])).toEqual([]);
  });

  it("rejects missing and prepared-but-unfinalized records", () => {
    expect(validate([
      { status: "D", path: ".arc/active/meta-origin.md" },
      { status: "A", path: targetPath },
    ])).toContainEqual(expect.stringMatching(/missing.*finalized/i));
    expect(
      validate(
        [{ status: "A", path: recordPath }, { status: "A", path: targetPath }],
        canonicalize({ kind: "prepared-decompose", schemaVersion: 1 }),
      ),
    ).toContainEqual(expect.stringMatching(/prepared.*not finalized/i));
  });

  it("rejects a recordless retirement with only existing-home destinations", () => {
    expect(validate([
      { status: "D", path: ".arc/active/meta-origin.md" },
      { status: "M", path: ".arc/reference/PROJECT-PRD.md" },
    ])).toContainEqual(expect.stringMatching(/missing.*retirement record/i));
  });

  it("does not reinterpret historical metadata changes in a merge as a new retirement", () => {
    expect(validateDecomposeCommitGate({
      changes: [
        { status: "D", path: ".arc/backlog/planned/old/meta-old.md" },
        { status: "A", path: ".arc/backlog/planned/new/meta-new.md" },
      ],
      mergeInProgress: true,
      readIndexBytes: () => null,
      readHeadBytes: () => null,
    })).toEqual([]);
  });

  it("allows same-slug relocations and other finalized retirement records", () => {
    expect(validate([
      { status: "D", path: ".arc/active/meta-origin.md" },
      { status: "A", path: ".arc/backlog/planned/origin/meta-origin.md" },
    ])).toEqual([]);
    const abandon = abandonReceipt("origin");
    const abandonPath = resolveRetirementRecordRelativePath(abandon.receiptId);
    expect(validateDecomposeCommitGate({
      changes: [
        { status: "A", path: abandonPath },
        { status: "D", path: ".arc/active/meta-origin.md" },
      ],
      readIndexBytes: (path) => path === abandonPath ? bytes(canonicalize(abandon)) : null,
      readHeadBytes: () => null,
    })).toEqual([]);
  });

  it("ignores a batch containing only non-decompose retirement records", () => {
    const first = abandonReceipt("origin-a");
    const second = abandonReceipt("origin-b", "d".repeat(40));
    const firstPath = resolveRetirementRecordRelativePath(first.receiptId);
    const secondPath = resolveRetirementRecordRelativePath(second.receiptId);
    expect(validateDecomposeCommitGate({
      changes: [{ status: "A", path: firstPath }, { status: "A", path: secondPath }],
      readIndexBytes: (path) => path === firstPath
        ? bytes(canonicalize(first))
        : bytes(canonicalize(second)),
      readHeadBytes: () => null,
    })).toEqual([]);
  });

  it("does not let non-decompose receipts mask an unrelated metadata deletion", () => {
    const abandon = abandonReceipt("origin-a");
    const abandonPath = resolveRetirementRecordRelativePath(abandon.receiptId);
    expect(validateDecomposeCommitGate({
      changes: [
        { status: "A", path: abandonPath },
        { status: "D", path: ".arc/active/meta-origin-b.md" },
      ],
      readIndexBytes: (path) => path === abandonPath ? bytes(canonicalize(abandon)) : null,
      readHeadBytes: () => null,
    })).toContainEqual(expect.stringMatching(/origin-b/));
  });

  it("rejects amended and patch-mismatched records", () => {
    expect(
      validate(
        [{ status: "M", path: recordPath }, { status: "A", path: targetPath }],
        canonicalize(receipt),
        bytes(canonicalize(receipt)),
      ),
    ).toContainEqual(expect.stringMatching(/amended|already exists/i));
    expect(validate([{ status: "A", path: recordPath }])).toContainEqual(expect.stringMatching(/patch.*mismatch/i));
  });
});
