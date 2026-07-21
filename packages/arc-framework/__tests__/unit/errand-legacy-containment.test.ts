/** Close-only containment and typed single-record read behavior. */

import { describe, expect, it } from "vitest";

import {
  LegacyIdentityOperationError,
  TransientIdentityRecordSchema,
  assertTransientIdentityOperation,
} from "../../src/lib/errand/identity-record.js";
import { readErrandRecord } from "../../src/lib/errand/record.js";
import type { GitExec } from "../../src/lib/git/exec.js";

const tip = "a".repeat(40);
const oid = "b".repeat(40);
const legacyBlob = `${JSON.stringify({
  version: 2,
  slug: "legacy",
  origin: "description",
  intent: "Close legacy",
  branch: "chore/legacy",
  createdAt: "2026-07-18T00:00:00.000Z",
  returnBranch: "feat/parent",
})}\n`;

function execForBlob(blob: string | null): GitExec {
  return async (_command, args) => {
    if (args[0] === "rev-parse") return { stdout: `${tip}\n` };
    if (args[0] === "ls-tree") {
      if (blob === null) return { stdout: "" };
      return { stdout: `100644 blob ${oid} ${Buffer.byteLength(blob)}\tlegacy\0` };
    }
    if (args[0] === "cat-file" && blob !== null) return { stdout: blob };
    throw new Error("unexpected Git invocation");
  };
}

describe("legacy identity containment", () => {
  it("permits only close across every state-changing operation", () => {
    const record = TransientIdentityRecordSchema.parse(JSON.parse(legacyBlob));
    expect(() => assertTransientIdentityOperation(record, "close")).not.toThrow();
    for (const operation of ["open", "link", "leave", "resume", "promote", "retire", "abandon"] as const) {
      expect(() => assertTransientIdentityOperation(record, operation)).toThrow(LegacyIdentityOperationError);
    }
  });

  it("returns a legacy record only to the close path", async () => {
    const io = { exec: execForBlob(legacyBlob), identity: "andrew" };
    await expect(readErrandRecord(io, "legacy", "close")).resolves.toMatchObject({
      version: 2,
      returnBranch: "feat/parent",
    });
    await expect(readErrandRecord(io, "legacy", "link")).rejects.toMatchObject({
      failure: { kind: "legacy-close-only", operation: "link" },
    });
  });

  it("keeps missing, malformed, unknown-version, and root failure distinct", async () => {
    await expect(readErrandRecord(
      { exec: execForBlob(null), identity: "andrew" },
      "legacy",
      "close",
    )).resolves.toBeNull();
    await expect(readErrandRecord(
      { exec: execForBlob("{bad"), identity: "andrew" },
      "legacy",
      "close",
    )).rejects.toMatchObject({ failure: { kind: "invalid-basis", diagnostics: [{ kind: "malformed" }] } });
    const future = JSON.stringify({ version: 99 });
    await expect(readErrandRecord(
      { exec: execForBlob(future), identity: "andrew" },
      "legacy",
      "close",
    )).rejects.toMatchObject({
      failure: { kind: "invalid-basis", diagnostics: [{ kind: "unknown-version", version: 99 }] },
    });
    await expect(readErrandRecord(
      { exec: async () => { throw new Error("git unavailable"); }, identity: "andrew" },
      "legacy",
      "close",
    )).rejects.toMatchObject({ failure: { kind: "snapshot-error", stage: "tip" } });
  });
});
