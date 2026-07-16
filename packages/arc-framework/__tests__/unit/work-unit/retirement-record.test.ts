import { describe, expect, it, vi } from "vitest";

import { canonicalDigest, canonicalize } from "../../../src/lib/canonical/canonical-json.js";
import { patchDigest, type PatchOperation } from "../../../src/lib/canonical/content-digest.js";
import { validateManagedPath } from "../../../src/lib/canonical/managed-path.js";
import type { RetirementReceipt } from "../../../src/lib/work-unit/retirement-authority.js";
import {
  recordRetirementReceipt,
  type RetirementRecordContext,
} from "../../../src/lib/work-unit/retirement-record.js";
import { resolveRetirementRecordRelativePath } from "../../../src/lib/work-unit/retirement-record-store.js";

const metaPath = validateManagedPath(".arc/active/meta-sample.md");
const operations = [{ operation: "delete", path: metaPath }] as const satisfies readonly PatchOperation[];
const initialVersion = canonicalDigest({ version: "initial" });

function receipt(): RetirementReceipt {
  return {
    schemaVersion: 1,
    receiptId: canonicalDigest({ receipt: "sample" }),
    subject: { kind: "work-unit", name: "sample" },
    transition: "abandon",
    source: {
      branch: "plan/sample",
      head: "a".repeat(40),
      artifactDigest: canonicalDigest({ artifact: "source" }),
    },
    transitionPatchDigest: patchDigest(operations),
    retiringProjection: { kind: "direct-transition" },
    authorization: "discard-confirmed",
    result: { kind: "discard", artifactDigest: "absent" },
  };
}

function context(): RetirementRecordContext & { version: { value: string }; staged: string[] } {
  const version = { value: initialVersion as string };
  const staged: string[] = [];
  return {
    cwd: "/repo",
    readAuthorityVersion: vi.fn(async () => version.value),
    readStagedPaths: vi.fn(async () => [...staged]),
    readTransitionPatch: vi.fn().mockResolvedValue(operations),
    createRecord: vi.fn().mockResolvedValue(undefined),
    removeRecord: vi.fn().mockResolvedValue(undefined),
    stagePaths: vi.fn().mockResolvedValue(undefined),
    version,
    staged,
  };
}

describe("recordRetirementReceipt", () => {
  it("records and stages a version-matched receipt, returning the next authority version", async () => {
    const ctx = context();
    const candidate = receipt();
    const recordPath = resolveRetirementRecordRelativePath(candidate.receiptId);

    const result = await recordRetirementReceipt(ctx, candidate, initialVersion);

    expect(result).toEqual({
      status: "recorded",
      authorityVersion: canonicalDigest({
        previousAuthorityVersion: initialVersion,
        receipt: candidate,
        stagedPaths: [metaPath, recordPath],
      }),
    });
    expect(ctx.createRecord).toHaveBeenCalledExactlyOnceWith(
      candidate.receiptId,
      canonicalize(candidate),
    );
    expect(ctx.stagePaths).toHaveBeenCalledExactlyOnceWith([metaPath, recordPath]);
  });

  it("returns authority-conflict before mutation when the version changed", async () => {
    const ctx = context();
    ctx.version.value = canonicalDigest({ version: "changed" });

    await expect(recordRetirementReceipt(ctx, receipt(), initialVersion)).resolves.toEqual({
      status: "refused",
      reason: "authority-conflict",
    });
    expect(ctx.createRecord).not.toHaveBeenCalled();
    expect(ctx.stagePaths).not.toHaveBeenCalled();
  });

  it("accepts already-staged paths only when they belong to the typed transition patch", async () => {
    const ctx = context();
    ctx.staged.push(metaPath);

    await expect(recordRetirementReceipt(ctx, receipt(), initialVersion)).resolves.toMatchObject({
      status: "recorded",
    });

    const conflicting = context();
    conflicting.staged.push("unrelated.txt");

    await expect(recordRetirementReceipt(conflicting, receipt(), initialVersion)).resolves.toEqual({
      status: "refused",
      reason: "evidence-mismatch",
    });
    expect(conflicting.createRecord).not.toHaveBeenCalled();
  });

  it("refuses a transition patch that includes its own receipt path", async () => {
    const ctx = context();
    const candidate = receipt();
    const recordPath = validateManagedPath(resolveRetirementRecordRelativePath(candidate.receiptId));
    vi.mocked(ctx.readTransitionPatch).mockResolvedValue([
      ...operations,
      { operation: "write", path: recordPath, contentDigest: canonicalDigest({ receipt: "bytes" }) },
    ]);

    await expect(recordRetirementReceipt(ctx, candidate, initialVersion)).resolves.toEqual({
      status: "refused",
      reason: "evidence-mismatch",
    });
    expect(ctx.createRecord).not.toHaveBeenCalled();
  });

  it("removes the newly created record when staging fails", async () => {
    const ctx = context();
    vi.mocked(ctx.stagePaths).mockRejectedValue(new Error("index locked"));
    const candidate = receipt();

    await expect(recordRetirementReceipt(ctx, candidate, initialVersion)).resolves.toEqual({
      status: "refused",
      reason: "authority-unavailable",
    });
    expect(ctx.removeRecord).toHaveBeenCalledExactlyOnceWith(candidate.receiptId);
  });
});
