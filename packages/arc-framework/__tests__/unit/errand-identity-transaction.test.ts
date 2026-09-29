/** Complete-basis identity reconciliation and transaction behavior. */

import { describe, expect, it } from "vitest";

import { reconcileIdentityObjects } from "../../src/lib/errand/identity-transaction.js";
import { transactTransientIdentities } from "../../src/lib/errand/identity-transaction.js";
import { TransientIdentityRecordV3Schema } from "../../src/lib/errand/identity-record.js";
import type { ErrandRecordIO } from "../../src/lib/errand/ref-tree.js";
import { GitProcessError } from "../../src/lib/git/process-error.js";

function objects(entries: Record<string, string>): Map<string, string> {
  return new Map(Object.entries(entries));
}

describe("identity object reconciliation", () => {
  it("preserves independent additions, updates, and deletions from both sides", () => {
    const result = reconcileIdentityObjects(
      objects({ updateLocal: "a", deleteLocal: "b", updateRemote: "c" }),
      objects({ updateLocal: "aa", updateRemote: "c", addLocal: "d" }),
      objects({ updateLocal: "a", deleteLocal: "b", updateRemote: "cc", addRemote: "e" }),
    );

    expect(result).toEqual({
      kind: "merged",
      objects: objects({ updateLocal: "aa", updateRemote: "cc", addLocal: "d", addRemote: "e" }),
    });
  });

  it("refuses divergent changes to the same key", () => {
    expect(reconcileIdentityObjects(
      objects({ shared: "a" }),
      objects({ shared: "b" }),
      objects({ shared: "c" }),
    )).toEqual({ kind: "conflict", keys: ["shared"] });
  });

  it("accepts convergent changes to the same key", () => {
    expect(reconcileIdentityObjects(
      objects({ shared: "a" }),
      objects({ shared: "b" }),
      objects({ shared: "b" }),
    )).toEqual({ kind: "merged", objects: objects({ shared: "b" }) });
  });

  it("preserves a key deletion made independently on both sides", () => {
    expect(reconcileIdentityObjects(
      objects({ shared: "a" }),
      new Map(),
      new Map(),
    )).toEqual({ kind: "merged", objects: new Map() });
  });

  it("treats an absent remote and common basis as empty without dropping local state", () => {
    expect(reconcileIdentityObjects(new Map(), objects({ local: "a" }), new Map())).toEqual({
      kind: "merged",
      objects: objects({ local: "a" }),
    });
  });
});

const oid = "a".repeat(40);
const timestamp = "2026-07-18T00:00:00.000Z";

function gitFailure(args: string[], stderr: string, stdout = ""): GitProcessError {
  return new GitProcessError({
    kind: "nonzero-exit", command: "git", args, exitCode: 1, stderr, stdout,
  });
}

function transactionIO(options: {
  writeFailures?: GitProcessError[];
  pushFailures?: GitProcessError[];
} = {}): ErrandRecordIO {
  const writes = [...(options.writeFailures ?? [])];
  const pushes = [...(options.pushFailures ?? [])];
  return {
    identity: "andrew",
    execInput: async () => oid,
    exec: async (_command, args) => {
      if (args[0] === "fetch") {
        throw new GitProcessError({
          kind: "nonzero-exit", command: "git", args, exitCode: 128,
          stderr: "couldn't find remote ref", expectedOutcome: "absent-remote-ref",
        });
      }
      if (args[0] === "rev-parse") throw new Error("Needed a single revision");
      if (args[0] === "commit-tree") return { stdout: oid };
      if (args[0] === "update-ref") {
        if (args[1] !== "-d") {
          const failure = writes.shift();
          if (failure !== undefined) throw failure;
        }
        return { stdout: "" };
      }
      if (args[0] === "push") {
        const failure = pushes.shift();
        if (failure !== undefined) throw failure;
        return { stdout: "" };
      }
      throw new Error(`unexpected Git operation: ${args.join(" ")}`);
    },
  };
}

function addAlpha(io: ErrandRecordIO, remote: string | null) {
  const record = TransientIdentityRecordV3Schema.parse({
    version: 3, kind: "errand", slug: "alpha", claimId: "aa".repeat(16),
    purpose: "errand", origin: "description", originEntry: null,
    intent: "alpha", branch: "chore/alpha", state: "open", savedHead: null,
    changeRequest: null, createdAt: timestamp, updatedAt: timestamp,
  });
  return transactTransientIdentities(io, {
    remote, message: "add alpha",
    transform: () => ({ kind: "applied", records: new Map([["alpha", record]]), value: "alpha" }),
  });
}

describe("identity transaction Git failure classification", () => {
  const beyondMessage = "x".repeat(1_100);

  it("retries a CAS rejection beyond the bounded message", async () => {
    const error = gitFailure(["update-ref"], `${beyondMessage} cannot lock ref: but expected old oid`);
    await expect(addAlpha(transactionIO({ writeFailures: [error] }), null))
      .resolves.toMatchObject({ kind: "applied", value: "alpha" });
  });

  it("stops on an unreachable remote beyond the bounded message", async () => {
    const error = gitFailure(["push"], `${beyondMessage} Could not read from remote`);
    await expect(addAlpha(transactionIO({ pushFailures: [error] }), "origin"))
      .resolves.toMatchObject({ kind: "error", stage: "push" });
  });

  it("does not classify a condition found only on stdout", async () => {
    const error = gitFailure(["update-ref"], "", "cannot lock ref: but expected old oid");
    await expect(addAlpha(transactionIO({ writeFailures: [error] }), null))
      .resolves.toMatchObject({ kind: "error", stage: "write" });
  });

  it("retains the message of an unrelated write failure", async () => {
    const error = gitFailure(["update-ref"], "permission denied");
    await expect(addAlpha(transactionIO({ writeFailures: [error] }), null))
      .resolves.toMatchObject({ kind: "error", stage: "write", message: error.message });
  });
});
