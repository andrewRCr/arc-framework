import { describe, expect, it, vi } from "vitest";

import { canonicalDigest, canonicalize } from "../../../src/lib/canonical/canonical-json.js";
import { patchDigest, type PatchOperation } from "../../../src/lib/canonical/content-digest.js";
import { validateManagedPath } from "../../../src/lib/canonical/managed-path.js";
import { receiptId } from "../../../src/lib/canonical/receipt-id.js";
import type { RetirementReceipt } from "../../../src/lib/work-unit/retirement-authority.js";
import {
  recordRetirementReceipt,
  type RetirementRecordContext,
} from "../../../src/lib/work-unit/retirement-record.js";
import { resolveRetirementRecordRelativePath } from "../../../src/lib/work-unit/retirement-record-store.js";

const metaPath = validateManagedPath(".arc/active/meta-sample.md");
const operations = [{ operation: "delete", path: metaPath }] as const satisfies readonly PatchOperation[];
const initialVersion = canonicalDigest({ version: "initial" });
const recordedVersion = canonicalDigest({ version: "recorded" });

function receipt(): RetirementReceipt {
  const subject = { kind: "work-unit", name: "sample" } as const;
  const source = {
    branch: "plan/sample",
    head: "a".repeat(40),
    artifactDigest: canonicalDigest({ artifact: "source" }),
  };
  return {
    schemaVersion: 1,
    receiptId: receiptId({
      schemaVersion: 1,
      subject,
      transition: "abandon",
      sourceBranch: source.branch,
      sourceHead: source.head,
    }),
    subject,
    transition: "abandon",
    source,
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
    withTransaction: vi.fn(async (operation) => await operation()),
    readAuthorityVersion: vi.fn(async () => version.value),
    readRecordedAuthorityVersion: vi.fn(async () => recordedVersion),
    readStagedPaths: vi.fn(async () => [...staged]),
    readTransitionPatch: vi.fn().mockResolvedValue(operations),
    createRecord: vi.fn().mockResolvedValue(undefined),
    removeRecord: vi.fn().mockResolvedValue(undefined),
    stagePaths: vi.fn(async (paths: readonly string[]) => {
      for (const path of paths) if (!staged.includes(path)) staged.push(path);
    }),
    rollbackPaths: vi.fn(async (paths: readonly string[]) => {
      for (const path of paths) {
        const index = staged.indexOf(path);
        if (index >= 0) staged.splice(index, 1);
      }
    }),
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
      authorityVersion: recordedVersion,
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
    expect(ctx.rollbackPaths).toHaveBeenCalled();
  });

  it.each(["authority", "patch", "staged paths"] as const)(
    "cleans up when the final %s read fails after staging",
    async (probe) => {
      const ctx = context();
      if (probe === "authority") {
        vi.mocked(ctx.readAuthorityVersion)
          .mockResolvedValueOnce(initialVersion)
          .mockRejectedValueOnce(new Error("final authority read failed"));
      } else if (probe === "patch") {
        vi.mocked(ctx.readTransitionPatch)
          .mockResolvedValueOnce(operations)
          .mockRejectedValueOnce(new Error("final patch read failed"));
      } else {
        vi.mocked(ctx.readStagedPaths)
          .mockResolvedValueOnce([])
          .mockRejectedValueOnce(new Error("final staged-path read failed"));
      }
      const candidate = receipt();

      await expect(recordRetirementReceipt(ctx, candidate, initialVersion)).resolves.toEqual({
        status: "refused",
        reason: "authority-unavailable",
      });
      expect(ctx.rollbackPaths).toHaveBeenCalled();
      expect(ctx.removeRecord).toHaveBeenCalledExactlyOnceWith(candidate.receiptId);
      expect(ctx.staged).toEqual([]);
    },
  );

  it("cleans up when deriving the recorded authority version fails", async () => {
    const ctx = context();
    vi.mocked(ctx.readRecordedAuthorityVersion).mockRejectedValue(new Error("recorded version read failed"));
    const candidate = receipt();

    await expect(recordRetirementReceipt(ctx, candidate, initialVersion)).resolves.toEqual({
      status: "refused",
      reason: "authority-unavailable",
    });
    expect(ctx.rollbackPaths).toHaveBeenCalled();
    expect(ctx.removeRecord).toHaveBeenCalledExactlyOnceWith(candidate.receiptId);
    expect(ctx.staged).toEqual([]);
  });

  it("surfaces incomplete cleanup after a post-create failure", async () => {
    const ctx = context();
    vi.mocked(ctx.readRecordedAuthorityVersion).mockRejectedValue(new Error("recorded version read failed"));
    vi.mocked(ctx.rollbackPaths).mockRejectedValue(new Error("index rollback failed hard"));
    vi.mocked(ctx.removeRecord).mockRejectedValue(new Error("record removal failed hard"));

    await expect(recordRetirementReceipt(ctx, receipt(), initialVersion)).resolves.toEqual({
      status: "refused",
      reason: "authority-unavailable",
      diagnostic:
        "retirement record operation failed: recorded version read failed. Rollback was incomplete: "
        + "index rollback failed: index rollback failed hard; record removal failed: record removal failed hard.",
    });
  });

  it("rolls back when authority drifts after staging but before the transaction commits", async () => {
    const ctx = context();
    vi.mocked(ctx.stagePaths).mockImplementation(async (paths) => {
      for (const path of paths) if (!ctx.staged.includes(path)) ctx.staged.push(path);
      ctx.version.value = canonicalDigest({ version: "concurrent-ref-change" });
    });
    const candidate = receipt();

    await expect(recordRetirementReceipt(ctx, candidate, initialVersion)).resolves.toEqual({
      status: "refused",
      reason: "authority-conflict",
    });
    expect(ctx.rollbackPaths).toHaveBeenCalled();
    expect(ctx.removeRecord).toHaveBeenCalledExactlyOnceWith(candidate.receiptId);
  });
});
