/** Tip-pinned transient identity snapshot behavior. */

import { describe, expect, it } from "vitest";

import {
  serializeTransientIdentityRecord,
  TransientIdentityRecordV3Schema,
} from "../../src/lib/errand/identity-record.js";
import {
  readTransientIdentitySnapshot,
  type IdentitySnapshotIO,
} from "../../src/lib/errand/identity-snapshot.js";
import { MAX_LOCUS_JSON_BYTES } from "../../src/lib/locus/schema/index.js";

const tip = "a".repeat(40);
const blobOid = "b".repeat(40);
const timestamp = "2026-07-18T00:00:00.000Z";
const record = serializeTransientIdentityRecord(TransientIdentityRecordV3Schema.parse({
  version: 3,
  kind: "errand",
  slug: "fix-output",
  claimId: "0123456789abcdef0123456789abcdef",
  purpose: "errand",
  origin: "description",
  originEntry: null,
  dispatchId: null,
  intent: "Fix output",
  branch: "chore/fix-output",
  state: "open",
  savedHead: null,
  changeRequest: null,
  createdAt: timestamp,
  updatedAt: timestamp,
}));

function io(exec: IdentitySnapshotIO["exec"]): IdentitySnapshotIO {
  return { identity: "andrew", exec };
}

describe("transient identity snapshots", () => {
  it("pins enumeration and blob reads to one resolved tip", async () => {
    const result = await readTransientIdentitySnapshot(io(async (_command, args) => {
      if (args[0] === "rev-parse") return { stdout: `${tip}\n` };
      if (args[0] === "ls-tree" && args.at(-1) === tip) {
        return { stdout: `100644 blob ${blobOid} ${Buffer.byteLength(record)}\tfix-output\0` };
      }
      if (args[0] === "cat-file" && args[2] === blobOid) return { stdout: record };
      throw new Error("read followed the moving ref instead of the pinned snapshot");
    }));

    expect(result).toMatchObject({ kind: "complete", tip, diagnostics: [] });
    if (result.kind !== "complete") throw new Error("expected a complete snapshot");
    expect(result.records.get("fix-output")).toMatchObject({ version: 3, slug: "fix-output" });
    expect(result.projections.get("fix-output")).toMatchObject({ key: "fix-output" });
  });

  it("distinguishes clean absence from tip and tree failures", async () => {
    const absent = await readTransientIdentitySnapshot(io(async () => {
      throw Object.assign(new Error("missing"), { stderr: "fatal: Needed a single revision" });
    }));
    const tipFailure = await readTransientIdentitySnapshot(io(async () => {
      throw new Error("git unavailable");
    }));
    const treeFailure = await readTransientIdentitySnapshot(io(async (_command, args) => {
      if (args[0] === "rev-parse") return { stdout: `${tip}\n` };
      throw new Error("object database corrupt");
    }));

    expect(absent).toEqual({ kind: "absent" });
    expect(tipFailure).toMatchObject({ kind: "error", stage: "tip" });
    expect(treeFailure).toMatchObject({ kind: "error", stage: "tree" });
  });

  it("rejects declared oversized input before reading its blob", async () => {
    const result = await readTransientIdentitySnapshot(io(async (_command, args) => {
      if (args[0] === "rev-parse") return { stdout: `${tip}\n` };
      if (args[0] === "ls-tree") {
        return { stdout: `100644 blob ${blobOid} ${MAX_LOCUS_JSON_BYTES + 1}\tfix-output\0` };
      }
      throw new Error("oversized blob must not be buffered");
    }));

    expect(result).toMatchObject({
      kind: "complete",
      diagnostics: [{ kind: "oversized", key: "fix-output" }],
    });
  });

  it("retains malformed, unknown-version, mismatched, and unreadable entries by key", async () => {
    const blobs = new Map([
      ["c".repeat(40), "{bad"],
      ["d".repeat(40), JSON.stringify({ version: 99 })],
      ["e".repeat(40), record],
    ]);
    const tree = [...blobs.entries(), ["f".repeat(40), "unreadable"] as const]
      .map(([oid, content], index) => {
        const keys = ["malformed", "future", "wrong-key", "unreadable"];
        return `100644 blob ${oid} ${Buffer.byteLength(content)}\t${keys[index]}\0`;
      })
      .join("");
    const result = await readTransientIdentitySnapshot(io(async (_command, args) => {
      if (args[0] === "rev-parse") return { stdout: `${tip}\n` };
      if (args[0] === "ls-tree") return { stdout: tree };
      const content = blobs.get(args[2] ?? "");
      if (content !== undefined) return { stdout: content };
      throw new Error("cannot read blob");
    }));

    expect(result).toMatchObject({
      kind: "complete",
      diagnostics: [
        { kind: "malformed", key: "malformed" },
        { kind: "unknown-version", key: "future", version: 99 },
        { kind: "key-mismatch", key: "wrong-key", slug: "fix-output" },
        { kind: "unreadable", key: "unreadable" },
      ],
    });
  });

  it("rejects a malformed or non-blob root enumeration", async () => {
    const malformed = await readTransientIdentitySnapshot(io(async (_command, args) => {
      if (args[0] === "rev-parse") return { stdout: `${tip}\n` };
      return { stdout: "not-an-ls-tree-entry\0" };
    }));
    const subtree = await readTransientIdentitySnapshot(io(async (_command, args) => {
      if (args[0] === "rev-parse") return { stdout: `${tip}\n` };
      return { stdout: `040000 tree ${blobOid} -\tnested\0` };
    }));

    expect(malformed).toMatchObject({ kind: "error", stage: "tree" });
    expect(subtree).toMatchObject({ kind: "error", stage: "tree" });
  });
});
