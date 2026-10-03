/** Tip-pinned transient identity snapshot behavior. */

import { describe, expect, it } from "vitest";

import {
  serializeTransientIdentityRecord,
  TransientIdentityRecordV3Schema,
} from "../../src/lib/errand/identity-record.js";
import {
  readTransientIdentitySnapshot,
  readTransientIdentitySnapshotAtRef,
  type IdentitySnapshotIO,
} from "../../src/lib/errand/identity-snapshot.js";
import {
  projectTransientInFlightRead,
  readTransientInFlightIndexes,
} from "../../src/lib/errand/record.js";
import { GitProcessError } from "../../src/lib/git/process-error.js";
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
      if (args[0] === "show-ref") return { stdout: "" };
      if (args[0] === "rev-parse") return { stdout: `${tip}\n` };
      if (args[0] === "ls-tree" && args.at(-1) === tip) {
        return { stdout: `100644 blob ${blobOid}     ${Buffer.byteLength(record)}\tfix-output\0` };
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
    const absent = await readTransientIdentitySnapshot(io(async (command, args) => {
      throw new GitProcessError({ kind: "nonzero-exit", command, args, exitCode: 2 });
    }));
    const tipFailure = await readTransientIdentitySnapshot(io(async () => {
      throw new Error("git unavailable");
    }));
    const treeFailure = await readTransientIdentitySnapshot(io(async (_command, args) => {
      if (args[0] === "show-ref") return { stdout: "" };
      if (args[0] === "rev-parse") return { stdout: `${tip}\n` };
      throw new Error("object database corrupt");
    }));

    expect(absent).toEqual({ kind: "absent" });
    expect(tipFailure).toMatchObject({ kind: "error", stage: "tip" });
    expect(treeFailure).toMatchObject({ kind: "error", stage: "tree" });
  });

  it.each(["plain", "canceled", "unexpected", "wrong-command", "wrong-ref", "wrong-exit"] as const)(
    "retains %s failures even when their diagnostics resemble an absent ref", async (kind) => {
      const args = ["show-ref", "--exists", "refs/arc/user/andrew/errands"];
      const original = kind === "plain" ? new Error("Needed a single revision")
        : new GitProcessError({ kind: kind === "canceled" ? "canceled" : kind === "unexpected" ? "unexpected" : "nonzero-exit",
          command: kind === "wrong-command" ? "other" : "git",
          args: kind === "wrong-ref" ? [...args.slice(0, 2), "refs/other"] : args,
          exitCode: kind === "wrong-exit" ? 1 : 2, stderr: "Needed a single revision" });
      const result = await readTransientIdentitySnapshot(io(async () => { throw original; }));
      expect(result).toMatchObject({ kind: "error", stage: "tip", error: original });
    },
  );

  it("keeps commit-resolution failure after named-ref presence succeeds", async () => {
    const original = new GitProcessError({ kind: "nonzero-exit", command: "git", args: ["rev-parse"],
      exitCode: 2, stderr: "Not a valid object name" });
    const result = await readTransientIdentitySnapshot(io(async (_command, args) => {
      if (args[0] === "show-ref") return { stdout: "" };
      throw original;
    }));
    expect(result).toMatchObject({ kind: "error", stage: "tip", error: original });
  });

  it("reads immutable commit snapshots without treating their OIDs as named refs", async () => {
    const seen: string[][] = [];
    const result = await readTransientIdentitySnapshotAtRef(io(async (_command, args) => {
      seen.push([...args]);
      if (args[0] === "show-ref") throw new Error("An OID is not a named ref");
      return { stdout: args[0] === "rev-parse" ? tip : "" };
    }), tip);
    expect(result).toMatchObject({ kind: "complete", tip });
    expect(seen.map((args) => args[0])).toEqual(["rev-parse", "ls-tree"]);
  });

  it("rejects a resolved tip that is not a full Git object ID", async () => {
    const result = await readTransientIdentitySnapshot(io(async () => ({ stdout: "HEAD\n" })));

    expect(result).toMatchObject({ kind: "error", stage: "tip" });
  });

  it("rejects declared oversized input before reading its blob", async () => {
    const result = await readTransientIdentitySnapshot(io(async (_command, args) => {
      if (args[0] === "show-ref") return { stdout: "" };
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
      if (args[0] === "show-ref") return { stdout: "" };
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

  it.each([
    ["malformed entry", "not-an-ls-tree-entry\0"],
    ["subtree", `040000 tree ${blobOid} -\tnested\0`],
    [
      "duplicate key",
      `100644 blob ${blobOid} 1\tduplicate\0`
        + `100644 blob ${"c".repeat(40)} 1\tduplicate\0`,
    ],
    ["non-NUL-terminated output", `100644 blob ${blobOid} 1\tunterminated`],
  ])("rejects a root enumeration containing a %s", async (_case, stdout) => {
    const result = await readTransientIdentitySnapshot(io(async (_command, args) => {
      if (args[0] === "show-ref") return { stdout: "" };
      if (args[0] === "rev-parse") return { stdout: `${tip}\n` };
      return { stdout };
    }));

    expect(result).toMatchObject({ kind: "error", stage: "tree" });
  });
});

describe("transient in-flight indexes", () => {
  const unborn = "fatal: ambiguous argument: unknown revision or path not in the working tree.";

  it("separates an unborn identity from one that could not be read", async () => {
    const absent = await readTransientInFlightIndexes({
      identity: "andrew",
      exec: async (command, args) => { throw new GitProcessError({ kind: "nonzero-exit", command, args, exitCode: 2, stderr: unborn }); },
    });
    const unreadable = await readTransientInFlightIndexes({
      identity: "andrew",
      exec: async () => { throw new Error("fatal: bad object"); },
    });

    // Both carry no records, and that is exactly why the distinction has to survive the
    // read: only the unborn arm establishes that the identity holds no claim.
    expect(absent).toMatchObject({ kind: "absent" });
    expect(unreadable).toMatchObject({ kind: "error", stage: "tip" });
    expect(projectTransientInFlightRead(absent).complete).toBe(true);
    expect(projectTransientInFlightRead(unreadable).complete).toBe(false);
  });

  it("treats a resolved identity with no records as an established empty claim set", async () => {
    const read = await readTransientInFlightIndexes({
      identity: "andrew",
      exec: async (_command, args) => {
        if (args[0] === "show-ref") return { stdout: "" };
        if (args[0] === "rev-parse") return { stdout: `${tip}\n` };
        return { stdout: "" };
      },
    });

    expect(read).toMatchObject({ kind: "complete", diagnostics: [] });
    expect(projectTransientInFlightRead(read).complete).toBe(true);
  });

  it("indexes readable records while refusing to call a partial read whole", async () => {
    const read = await readTransientInFlightIndexes({
      identity: "andrew",
      exec: async (_command, args) => {
        if (args[0] === "show-ref") return { stdout: "" };
        if (args[0] === "rev-parse") return { stdout: `${tip}\n` };
        if (args[0] === "ls-tree") {
          return {
            stdout: `100644 blob ${blobOid}     ${Buffer.byteLength(record)}\tfix-output\0`
              + `100644 blob ${"c".repeat(40)}     4\tbroken\0`,
          };
        }
        if (args[2] === blobOid) return { stdout: record };
        return { stdout: "{[}" };
      },
    });

    expect(read.kind).toBe("complete");
    if (read.kind !== "complete") throw new Error("expected a complete read");
    // The readable record still indexes — the partial read is usable, just not whole.
    expect(read.indexes.slugByBranch.get("chore/fix-output")).toBe("fix-output");
    expect(read.indexes.expectedBySlug.get("fix-output")).toMatchObject({ kind: "errand" });
    expect(read.diagnostics).toHaveLength(1);

    const projected = projectTransientInFlightRead(read);
    expect(projected.complete).toBe(false);
    expect(projected.degraded).toContain("1 unreadable entry");
  });

  it("resolves a null identity as an established absence", async () => {
    const read = await readTransientInFlightIndexes({
      identity: null,
      exec: async () => { throw new Error("no read is expected without an identity"); },
    });

    expect(read).toMatchObject({ kind: "absent" });
    expect(projectTransientInFlightRead(read).complete).toBe(true);
  });
});
