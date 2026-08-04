import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import type { GitExec } from "../../src/lib/git/exec.js";
import { canonicalDigest } from "../../src/lib/kernel/index.js";
import {
  ReviewReceiptV2Schema,
} from "../../src/scripts/review-gate/core/gate-contract-v2-schema.js";
import { parseEvidence } from "../../src/scripts/review-gate/core/evidence.js";
import {
  RepositoryGitCommonStatePublisher,
} from "../../src/lib/git-common-state.js";
import {
  LocalReviewOperationStateStore,
} from "../../src/scripts/review-gate/hosts/local/operation-state-store.js";

const roots: string[] = [];
const digest = (value: string): string => canonicalDigest({ value });

afterEach(async () => {
  await Promise.all(roots.splice(0).map(async (root) => rm(root, { recursive: true, force: true })));
});

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "arc-review-operations-"));
  roots.push(root);
  const commonDir = join(root, "common.git");
  await mkdir(commonDir, { recursive: true });
  const exec: GitExec = async () => ({ stdout: `${commonDir}\n` });
  const store = new LocalReviewOperationStateStore(new RepositoryGitCommonStatePublisher(exec, root));
  const state = {
    schemaVersion: 1 as const,
    semanticsVersion: "review-operation/v1" as const,
    operationId: "frontline-target-source-0",
    updatedAt: "2026-07-20T20:00:00Z",
    kind: "frontline-run" as const,
    targetId: digest("target"),
    sourceIdentity: "local-frontline",
    generation: 0,
    outcome: "findings" as const,
    passCount: 1,
    policyVersion: digest("policy"),
    sourceBindingId: digest("source-binding"),
  };
  return { root, commonDir, exec, store, state };
}

describe("local review operation state authority", () => {
  it("serializes identical sibling replay into one repository-shared version", async () => {
    const records = await fixture();
    const sibling = new LocalReviewOperationStateStore(new RepositoryGitCommonStatePublisher(
      records.exec,
      join(records.root, "sibling-worktree"),
    ));

    await expect(Promise.all([
      records.store.publishOperation(records.state, 0),
      sibling.publishOperation(records.state, 0),
    ])).resolves.toEqual([{ version: 1 }, { version: 1 }]);
    await expect(sibling.readOperation(records.state.operationId)).resolves.toEqual({
      version: 1,
      state: records.state,
    });
  });

  it("rejects stale conflicting publication without overwriting recoverable state", async () => {
    const records = await fixture();
    await records.store.publishOperation(records.state, 0);
    const before = await records.store.readOperation(records.state.operationId);

    await expect(records.store.publishOperation({
      ...records.state,
      updatedAt: "2026-07-20T20:01:00Z",
      outcome: "clean",
    }, 0)).rejects.toThrow(/version-conflict/u);
    await expect(records.store.readOperation(records.state.operationId)).resolves.toEqual(before);
  });

  it("rejects a same-record operation identity mismatch without overwriting it", async () => {
    const records = await fixture();
    const directory = join(records.commonDir, "arc", "review-gate", "operations");
    const fileDigest = canonicalDigest({ operationId: records.state.operationId }).slice("sha256:".length);
    const path = join(directory, `operation-${fileDigest}.json`);
    const mismatched = JSON.stringify({
      schemaVersion: 1,
      semanticsVersion: "review-operation-store/v1",
      operationId: records.state.operationId,
      version: 1,
      state: { ...records.state, operationId: "different-operation" },
    });
    await mkdir(directory, { recursive: true });
    await writeFile(path, `${mismatched}\n`, "utf8");

    await expect(records.store.publishOperation(records.state, 1)).rejects.toThrow(/operation-id-mismatch/u);
    await expect(readFile(path, "utf8")).resolves.toBe(`${mismatched}\n`);
  });

  it("cannot parse operation variants as receipts or gate evidence", async () => {
    const records = await fixture();
    await records.store.publishOperation(records.state, 0);
    const stored = await records.store.readOperation(records.state.operationId);

    expect(() => ReviewReceiptV2Schema.parse(stored.state)).toThrow();
    expect(() => parseEvidence(stored.state)).toThrow();
    const evidencePath = join(records.commonDir, "arc", "review-gate", "evidence");
    await expect(readFile(evidencePath, "utf8")).rejects.toMatchObject({ code: "ENOENT" });
  });
});
