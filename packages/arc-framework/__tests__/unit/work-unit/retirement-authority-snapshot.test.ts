import { describe, expect, it, vi } from "vitest";

import type { GitExec } from "../../../src/lib/git/exec.js";
import {
  readRetirementAuthoritySnapshot,
  revalidateRetirementAuthoritySnapshot,
  type RetirementSnapshotContext,
} from "../../../src/lib/work-unit/retirement-authority-snapshot.js";
import type { RetirementAuthorityScope } from "../../../src/lib/work-unit/retirement-authority.js";

const sourceHead = "a".repeat(40);
const resultHead = "b".repeat(40);
const indexTree = "c".repeat(40);

const scope: RetirementAuthorityScope = {
  subject: { kind: "work-unit", name: "sample" },
  transition: "abandon",
  source: { branch: "plan/sample", head: sourceHead },
  resultProjection: { ref: "main", head: resultHead },
};

function context(): RetirementSnapshotContext & {
  refs: Map<string, string>;
} {
  const refs = new Map([
    ["refs/heads/plan/sample", sourceHead],
    ["refs/heads/main", resultHead],
  ]);
  const exec: GitExec = vi.fn(async (_cmd, args) => {
    if (args[0] === "rev-parse" && args[1] === "--verify") {
      const ref = args[2]?.replace(/\^\{commit\}$/u, "") ?? "";
      const oid = refs.get(ref);
      if (oid === undefined) throw new Error(`unknown ref ${ref}`);
      return { stdout: `${oid}\n` };
    }
    if (args[0] === "write-tree") return { stdout: `${indexTree}\n` };
    throw new Error(`unexpected git invocation: ${args.join(" ")}`);
  });
  return {
    cwd: "/repo",
    exec,
    readInventory: vi.fn().mockResolvedValue({ paths: [".arc/active/meta-sample.md"] }),
    refs,
  };
}

describe("readRetirementAuthoritySnapshot", () => {
  it("returns a record-neutral opaque compare-and-set token", async () => {
    const ctx = context();

    await expect(readRetirementAuthoritySnapshot(ctx, scope)).resolves.toEqual({
      status: "resolved",
      snapshot: {
        authorityVersion: expect.stringMatching(/^sha256:[0-9a-f]{64}$/u),
        sourceRefOid: sourceHead,
        resultRefOid: resultHead,
      },
    });

    const result = await readRetirementAuthoritySnapshot(ctx, scope);
    if (result.status !== "resolved") throw new Error("expected resolved snapshot");
    expect(result.snapshot.authorityVersion).not.toBe(sourceHead);
    expect(result.snapshot.authorityVersion).not.toBe(resultHead);
  });

  it("refuses an initially mismatched source or result projection", async () => {
    const ctx = context();
    ctx.refs.set("refs/heads/plan/sample", "d".repeat(40));

    await expect(readRetirementAuthoritySnapshot(ctx, scope)).resolves.toEqual({
      status: "refused",
      reason: "projection-mismatch",
    });
  });
});

describe("revalidateRetirementAuthoritySnapshot", () => {
  it.each([
    ["source ref", (ctx: ReturnType<typeof context>) => ctx.refs.set("refs/heads/plan/sample", "d".repeat(40))],
    ["base ref", (ctx: ReturnType<typeof context>) => ctx.refs.set("refs/heads/main", "e".repeat(40))],
    ["storage version", (ctx: ReturnType<typeof context>) => { ctx.storageVersion = 2; }],
  ] as const)("returns authority-conflict after a %s change", async (_label, mutate) => {
    const ctx = context();
    const initial = await readRetirementAuthoritySnapshot(ctx, scope);
    if (initial.status !== "resolved") throw new Error("expected resolved snapshot");

    mutate(ctx);

    await expect(
      revalidateRetirementAuthoritySnapshot(ctx, scope, initial.snapshot.authorityVersion),
    ).resolves.toEqual({ status: "refused", reason: "authority-conflict" });
  });

  it("accepts only the exact byte-for-byte token returned by readSnapshot", async () => {
    const ctx = context();
    const initial = await readRetirementAuthoritySnapshot(ctx, scope);
    if (initial.status !== "resolved") throw new Error("expected resolved snapshot");

    await expect(
      revalidateRetirementAuthoritySnapshot(ctx, scope, initial.snapshot.authorityVersion),
    ).resolves.toEqual({ status: "valid", snapshot: initial.snapshot });
    await expect(
      revalidateRetirementAuthoritySnapshot(ctx, scope, `${initial.snapshot.authorityVersion}:changed`),
    ).resolves.toEqual({ status: "refused", reason: "authority-conflict" });
  });
});
