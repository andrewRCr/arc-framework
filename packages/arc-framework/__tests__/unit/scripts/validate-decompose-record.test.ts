import { describe, expect, it } from "vitest";

import { canonicalDigest, canonicalize } from "../../../src/lib/canonical/canonical-json.js";
import { contentDigest, patchDigest } from "../../../src/lib/canonical/content-digest.js";
import { validateManagedPath } from "../../../src/lib/canonical/managed-path.js";
import { resolveRetirementRecordRelativePath } from "../../../src/lib/work-unit/retirement-record-store.js";
import {
  validateDecomposeCommitGate,
  type StagedPathChange,
} from "../../../src/scripts/validate-decompose-record.js";

const bytes = (value: string) => new TextEncoder().encode(value);
const receiptId = canonicalDigest("receipt");
const recordPath = resolveRetirementRecordRelativePath(receiptId);
const targetPath = validateManagedPath(".arc/backlog/planned/group/member/meta-member.md");
const targetBytes = bytes("member");
const receipt = {
  schemaVersion: 1,
  receiptId,
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

  it("allows same-slug relocations and other finalized retirement records", () => {
    expect(validate([
      { status: "D", path: ".arc/active/meta-origin.md" },
      { status: "A", path: ".arc/backlog/planned/origin/meta-origin.md" },
    ])).toEqual([]);
    expect(validate(
      [{ status: "A", path: recordPath }, { status: "D", path: ".arc/active/meta-origin.md" }],
      canonicalize({ ...receipt, transition: "abandon", result: { kind: "discard", artifactDigest: "absent" } }),
    )).toEqual([]);
  });

  it("ignores a batch containing only non-decompose retirement records", () => {
    const otherId = canonicalDigest("other-receipt");
    const otherPath = resolveRetirementRecordRelativePath(otherId);
    const abandon = (id: string) => bytes(canonicalize({
      ...receipt,
      receiptId: id,
      transition: "abandon",
      result: { kind: "discard", artifactDigest: "absent" },
    }));
    expect(validateDecomposeCommitGate({
      changes: [{ status: "A", path: recordPath }, { status: "A", path: otherPath }],
      readIndexBytes: (path) => path === recordPath ? abandon(receiptId) : abandon(otherId),
      readHeadBytes: () => null,
    })).toEqual([]);
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
