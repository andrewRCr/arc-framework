import { describe, expect, it } from "vitest";

import { canonicalDigest, canonicalize } from "../../../src/lib/canonical/canonical-json.js";
import { contentDigest, patchDigest } from "../../../src/lib/canonical/content-digest.js";
import { validateManagedPath } from "../../../src/lib/canonical/managed-path.js";
import { receiptId as deriveReceiptId } from "../../../src/lib/canonical/receipt-id.js";
import {
  RETIREMENT_RECORD_NAMESPACE,
  resolveRetirementRecordRelativePath,
} from "../../../src/lib/work-unit/retirement-record-store.js";
import {
  parseStagedPathChanges,
  validateDecomposeCommitGate,
  type StagedPathChange,
} from "../../../src/scripts/validate-decompose-record.js";

const bytes = (value: string) => new TextEncoder().encode(value);
const decomposeSubject = { kind: "work-unit" as const, name: "origin" };
const decomposeSource = { branch: "plan/origin", head: "a".repeat(40) };
const decomposeReceiptId = deriveReceiptId({
  schemaVersion: 1,
  subject: decomposeSubject,
  transition: "decompose",
  sourceBranch: decomposeSource.branch,
  sourceHead: decomposeSource.head,
});
const recordPath = resolveRetirementRecordRelativePath(decomposeReceiptId);
const targetPath = validateManagedPath(".arc/backlog/planned/group/member/meta-member.md");
const targetBytes = bytes("member");
const receipt = {
  schemaVersion: 1,
  receiptId: decomposeReceiptId,
  subject: decomposeSubject,
  transition: "decompose",
  source: { ...decomposeSource, artifactDigest: canonicalDigest("source") },
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

function abandonReceipt(name: string, sourceHead = "c".repeat(40), extraChanges: StagedPathChange[] = []) {
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
    transitionPatchDigest: patchDigest([
      { operation: "delete", path: validateManagedPath(`.arc/active/meta-${name}.md`) },
      ...extraChanges.flatMap((change) => {
        if (change.status === "D") return [{ operation: "delete" as const, path: validateManagedPath(change.path) }];
        return [];
      }),
    ]),
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

interface RenameFixtureOptions {
  sourcePaths?: string[];
  targetPaths?: string[];
  targetMetaStatus?: "A" | "M";
  recordStatus?: "A" | "M";
  headRecord?: boolean;
  patchMismatch?: boolean;
  extraChanges?: StagedPathChange[];
}

function validateRename(options: RenameFixtureOptions = {}): string[] {
  const sourceSlug = "origin";
  const targetSlug = "renamed-origin";
  const sourcePaths = options.sourcePaths ?? [
    `.arc/active/meta-${sourceSlug}.md`,
    `.arc/active/spec-${sourceSlug}.md`,
  ];
  const targetPaths = options.targetPaths ?? [
    `.arc/active/meta-${targetSlug}.md`,
    `.arc/active/spec-${targetSlug}.md`,
  ];
  const changes: StagedPathChange[] = [
    ...sourcePaths.map((path): StagedPathChange => ({ status: "D", path })),
    ...targetPaths.map((path): StagedPathChange => ({
      status: path.endsWith(`/meta-${targetSlug}.md`) ? options.targetMetaStatus ?? "A" : "A",
      path,
    })),
    ...(options.extraChanges ?? []),
  ];
  const operationBytes = new Map<string, Uint8Array>();
  for (const change of changes) {
    if (change.status !== "D") operationBytes.set(change.path, bytes(`staged:${change.path}`));
  }
  const operations = changes.map((change) => change.status === "D"
    ? { operation: "delete" as const, path: validateManagedPath(change.path) }
    : {
        operation: "write" as const,
        path: validateManagedPath(change.path),
        contentDigest: contentDigest(operationBytes.get(change.path) ?? bytes("missing")),
      });
  const subject = { kind: "work-unit" as const, name: sourceSlug };
  const source = { branch: `feat/${sourceSlug}`, head: "e".repeat(40) };
  const renameReceiptId = deriveReceiptId({
    schemaVersion: 1,
    subject,
    transition: "rename",
    sourceBranch: source.branch,
    sourceHead: source.head,
  });
  const renameReceipt = {
    schemaVersion: 1 as const,
    receiptId: renameReceiptId,
    subject,
    transition: "rename" as const,
    source: { ...source, artifactDigest: canonicalDigest("rename-source") },
    transitionPatchDigest: options.patchMismatch ? canonicalDigest("wrong-patch") : patchDigest(operations),
    retiringProjection: { kind: "direct-transition" as const },
    authorization: "identity-renamed" as const,
    result: {
      kind: "rename" as const,
      targetSlug,
      artifactDigest: canonicalDigest("rename-result"),
    },
  };
  const renameRecordPath = resolveRetirementRecordRelativePath(renameReceiptId);
  changes.unshift({ status: options.recordStatus ?? "A", path: renameRecordPath });
  const recordBytes = bytes(canonicalize(renameReceipt));
  return validateDecomposeCommitGate({
    changes,
    readIndexBytes: (path) => path === renameRecordPath ? recordBytes : operationBytes.get(path) ?? null,
    readHeadBytes: (path) => path === renameRecordPath && options.headRecord === true ? recordBytes : null,
  });
}

describe("validateDecomposeCommitGate", () => {
  it("covers a rename only when its target lifecycle metadata is a staged addition", () => {
    expect(validateRename()).toEqual([]);
    expect(validateRename({ targetPaths: [".arc/active/spec-renamed-origin.md"] }))
      .toContainEqual(expect.stringMatching(/target lifecycle metadata.*renamed-origin/iu));
    expect(validateRename({ targetMetaStatus: "M" }))
      .toContainEqual(expect.stringMatching(/target lifecycle metadata.*addition/iu));
  });

  it("requires old-to-new artifact prefix multisets to correspond", () => {
    expect(validateRename({ targetPaths: [".arc/active/meta-renamed-origin.md"] }))
      .toContainEqual(expect.stringMatching(/artifact correspondence/iu));
    expect(validateRename({
      targetPaths: [
        ".arc/active/meta-renamed-origin.md",
        ".arc/active/spec-renamed-origin.md",
        ".arc/active/tasks-renamed-origin.md",
      ],
    })).toContainEqual(expect.stringMatching(/artifact correspondence/iu));
    expect(validateRename({
      sourcePaths: [
        ".arc/active/meta-origin.md",
        ".arc/backlog/planned/group/meta-origin.md",
      ],
      targetPaths: [".arc/active/meta-renamed-origin.md"],
    })).toContainEqual(expect.stringMatching(/artifact correspondence/iu));
  });

  it("ignores foreign staged files in rename correspondence", () => {
    expect(validateRename({
      extraChanges: [{ status: "A", path: ".arc/reference/unrelated.md" }],
    })).toEqual([]);
  });

  it("reports amended and patch-mismatched rename evidence specifically", () => {
    expect(validateRename({ recordStatus: "M", headRecord: true }))
      .toContainEqual(expect.stringMatching(/already exists|amended/iu));
    expect(validateRename({ patchMismatch: true }))
      .toContainEqual(expect.stringMatching(/patch digest mismatch/iu));
  });
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
        [
          { status: "D", path: ".arc/active/meta-origin.md" },
          { status: "A", path: recordPath },
          { status: "A", path: targetPath },
        ],
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
    const oldPath = ".arc/backlog/planned/old/meta-old.md";
    const newPath = ".arc/backlog/planned/new/meta-new.md";
    const oldMeta = bytes("old meta");
    const newMeta = bytes("new meta");
    expect(validateDecomposeCommitGate({
      changes: [
        { status: "D", path: oldPath },
        { status: "A", path: newPath },
      ],
      mergeInProgress: true,
      readIndexBytes: (path) => path === newPath ? newMeta : null,
      readHeadBytes: (path) => path === oldPath ? oldMeta : null,
      readParentBytes: (path) => path === oldPath ? [oldMeta, null] : [null, newMeta],
    })).toEqual([]);
  });

  it("does not revalidate historical decompose evidence introduced by a merge", () => {
    const originPath = ".arc/active/meta-origin.md";
    const unrelatedPath = ".arc/reference/unrelated.md";
    const recordBytes = bytes(canonicalize(receipt));
    const originBytes = bytes("origin meta");
    const unrelatedBytes = bytes("merge result");
    expect(validateDecomposeCommitGate({
      changes: [
        { status: "A", path: recordPath },
        { status: "D", path: originPath },
        { status: "A", path: unrelatedPath },
      ],
      mergeInProgress: true,
      readIndexBytes: (path) => path === recordPath ? recordBytes : unrelatedBytes,
      readHeadBytes: (path) => path === originPath ? originBytes : null,
      readParentBytes: (path) => {
        if (path === recordPath) return [null, recordBytes];
        if (path === originPath) return [originBytes, null];
        return [null, unrelatedBytes];
      },
    })).toEqual([]);
  });

  it("rejects a merge resolution that newly deletes lifecycle metadata", () => {
    const originPath = ".arc/active/meta-origin.md";
    const originBytes = bytes("origin meta");
    expect(validateDecomposeCommitGate({
      changes: [{ status: "D", path: originPath }],
      mergeInProgress: true,
      readIndexBytes: () => null,
      readHeadBytes: () => originBytes,
      readParentBytes: () => [originBytes, originBytes],
    })).toContainEqual(expect.stringMatching(/missing.*origin/iu));
  });

  it("rejects a newly introduced retirement receipt in a merge", () => {
    const originPath = ".arc/active/meta-origin.md";
    const originBytes = bytes("origin meta");
    expect(validateDecomposeCommitGate({
      changes: [
        { status: "A", path: recordPath },
        { status: "D", path: originPath },
      ],
      mergeInProgress: true,
      readIndexBytes: (path) => path === recordPath ? bytes(canonicalize(receipt)) : null,
      readHeadBytes: (path) => path === originPath ? originBytes : null,
      readParentBytes: (path) => path === originPath
        ? [originBytes, originBytes]
        : [null, null],
    })).toContainEqual(expect.stringMatching(/merge commits cannot introduce retirement records/iu));
  });

  it("treats an unreadable merge resolution as novel and fails closed", () => {
    expect(validateDecomposeCommitGate({
      changes: [{ status: "A", path: recordPath }],
      mergeInProgress: true,
      readIndexBytes: () => null,
      readHeadBytes: () => null,
      readParentBytes: () => [null, null],
    })).toContainEqual(expect.stringMatching(/merge commits cannot introduce retirement records/iu));
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

  it("does not treat arbitrary meta-shaped paths as lifecycle retirement replacements", () => {
    expect(validateDecomposeCommitGate({
      changes: [
        { status: "D", path: ".arc/active/meta-origin.md" },
        { status: "A", path: "docs/meta-origin.md" },
      ],
      readIndexBytes: (path) => path === "docs/meta-origin.md" ? bytes("lookalike") : null,
      readHeadBytes: () => null,
    })).toContainEqual(expect.stringMatching(/missing.*origin/i));

    expect(validateDecomposeCommitGate({
      changes: [{ status: "D", path: "docs/meta-unrelated.md" }],
      readIndexBytes: () => null,
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

  it("does not let a copied receipt at a non-deterministic path cover a retirement", () => {
    const abandon = abandonReceipt("origin");
    const copiedPath = resolveRetirementRecordRelativePath(canonicalDigest("copied-path"));
    expect(validateDecomposeCommitGate({
      changes: [
        { status: "A", path: copiedPath },
        { status: "D", path: ".arc/active/meta-origin.md" },
      ],
      readIndexBytes: (path) => path === copiedPath ? bytes(canonicalize(abandon)) : null,
      readHeadBytes: () => null,
    })).toContainEqual(expect.stringMatching(/origin/));
  });

  it("does not accept a receipt from a lookalike retirement-record namespace", () => {
    const abandon = abandonReceipt("origin");
    const canonicalPath = resolveRetirementRecordRelativePath(abandon.receiptId);
    const spoofedPath = canonicalPath.replace(
      `${RETIREMENT_RECORD_NAMESPACE}/`,
      "xarc/yinternal/retirement-receipts/",
    );
    expect(validateDecomposeCommitGate({
      changes: [
        { status: "A", path: spoofedPath },
        { status: "D", path: ".arc/active/meta-origin.md" },
      ],
      readIndexBytes: (path) => path === spoofedPath ? bytes(canonicalize(abandon)) : null,
      readHeadBytes: () => null,
    })).toContainEqual(expect.stringMatching(/missing.*origin/i));
  });

  it("does not let a receipt for an older patch cover the current staged retirement", () => {
    const abandon = abandonReceipt("origin");
    const abandonPath = resolveRetirementRecordRelativePath(abandon.receiptId);
    const unrelatedPath = ".arc/reference/PROJECT.md";
    expect(validateDecomposeCommitGate({
      changes: [
        { status: "A", path: abandonPath },
        { status: "D", path: ".arc/active/meta-origin.md" },
        { status: "A", path: unrelatedPath },
      ],
      readIndexBytes: (path) => path === abandonPath
        ? bytes(canonicalize(abandon))
        : path === unrelatedPath ? bytes("changed") : null,
      readHeadBytes: () => null,
    })).toContainEqual(expect.stringMatching(/origin/));
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

  it.each(["A", "M", "D"] as const)("rejects %s changes beneath root-level .arc/.internal", (status) => {
    const path = ".arc/.internal/retirement-receipts/record.json";
    expect(validateDecomposeCommitGate({
      changes: [{ status, path }],
      readIndexBytes: () => status === "D" ? null : bytes("record"),
      readHeadBytes: () => status === "A" ? null : bytes("record"),
    })).toEqual([`root-level ARC internal namespace is forbidden: ${path}`]);
  });

  it("admits a legacy receipt relocation whose exact bytes survive at the canonical namespace", () => {
    const abandon = abandonReceipt("origin");
    const canonicalPath = resolveRetirementRecordRelativePath(abandon.receiptId);
    const legacyPath = canonicalPath.replace(
      `${RETIREMENT_RECORD_NAMESPACE}/`,
      ".arc/.internal/retirement-receipts/",
    );
    const preserved = bytes(canonicalize(abandon));
    expect(validateDecomposeCommitGate({
      changes: [{ status: "D", path: legacyPath }],
      readIndexBytes: (path) => path === canonicalPath ? preserved : null,
      readHeadBytes: (path) => path === legacyPath ? preserved : null,
    })).toEqual([]);
  });

  it.each([
    ["absent canonically", null],
    ["canonically divergent", bytes("different record")],
  ])("rejects a legacy receipt deletion %s", (_label, canonicalBytes) => {
    const abandon = abandonReceipt("origin");
    const canonicalPath = resolveRetirementRecordRelativePath(abandon.receiptId);
    const legacyPath = canonicalPath.replace(
      `${RETIREMENT_RECORD_NAMESPACE}/`,
      ".arc/.internal/retirement-receipts/",
    );
    expect(validateDecomposeCommitGate({
      changes: [{ status: "D", path: legacyPath }],
      readIndexBytes: (path) => path === canonicalPath ? canonicalBytes : null,
      readHeadBytes: (path) => path === legacyPath ? bytes(canonicalize(abandon)) : null,
    })).toEqual([`root-level ARC internal namespace is forbidden: ${legacyPath}`]);
  });

  it("rejects a legacy deletion outside retirement-receipts even when bytes exist canonically", () => {
    const legacyPath = ".arc/.internal/other-state/record.json";
    const preserved = bytes("record");
    expect(validateDecomposeCommitGate({
      changes: [{ status: "D", path: legacyPath }],
      readIndexBytes: () => preserved,
      readHeadBytes: () => preserved,
    })).toEqual([`root-level ARC internal namespace is forbidden: ${legacyPath}`]);
  });

  it("rejects root-level .arc/.internal inherited unchanged from a merge parent", () => {
    const path = ".arc/.internal/retirement-receipts/record.json";
    const inherited = bytes("legacy record");
    expect(validateDecomposeCommitGate({
      changes: [{ status: "A", path }],
      mergeInProgress: true,
      readIndexBytes: () => inherited,
      readHeadBytes: () => null,
      readParentBytes: () => [null, inherited],
    })).toEqual([`root-level ARC internal namespace is forbidden: ${path}`]);
  });
});

describe("parseStagedPathChanges", () => {
  it("decodes NUL-framed paths containing tabs and newlines losslessly", () => {
    expect(parseStagedPathChanges("A\0docs/tab\tname.md\0M\0docs/line\nname.md\0")).toEqual([
      { status: "A", path: "docs/tab\tname.md" },
      { status: "M", path: "docs/line\nname.md" },
    ]);
  });

  it.each([
    ["type change", "T\0.arc/.internal/retirement-receipts/record.json\0"],
    ["unknown status", "X\0path.md\0"],
    ["missing path", "A\0"],
    ["missing terminator", "A\0path.md"],
  ])("rejects %s records instead of omitting them", (_label, output) => {
    expect(() => parseStagedPathChanges(output)).toThrow(/malformed|unsupported/iu);
  });
});
