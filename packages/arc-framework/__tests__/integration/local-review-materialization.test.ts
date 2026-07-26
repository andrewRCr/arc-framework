import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { createExecaGitExec } from "../../src/lib/git/process-executor.js";
import { createReviewTarget } from "../../src/scripts/review-gate/core/gate-contract-v2.js";
import {
  createLocalReviewSourceDescriptor,
  ensureLocalReviewSourceMaterialized,
  inspectLocalReviewSourceMaterialization,
  LocalReviewMaterializationError,
} from "../../src/scripts/review-gate/hosts/local/review-materialization.js";
import {
  RepositoryLocalReviewSourceSweepAdapter,
} from "../../src/scripts/review-gate/hosts/local/source-sweep.js";

const roots: string[] = [];
const exec = createExecaGitExec();

afterEach(async () => {
  await Promise.all(roots.splice(0).map(async (root) => rm(root, { recursive: true, force: true })));
});

async function git(cwd: string, ...args: string[]): Promise<string> {
  return (await exec("git", args, { cwd })).stdout.trim();
}

async function fixture() {
  const parent = await mkdtemp(join(tmpdir(), "arc-review-materialization-"));
  roots.push(parent);
  const root = join(parent, "repository");
  await git(parent, "init", "-b", "main", root);
  await git(root, "config", "user.name", "ARC Test");
  await git(root, "config", "user.email", "arc@example.test");
  await writeFile(join(root, "tracked.txt"), "base\n", "utf8");
  await git(root, "add", "tracked.txt");
  await git(root, "commit", "-m", "base");
  const diffBaseSha = await git(root, "rev-parse", "HEAD");
  const diffBaseTree = await git(root, "rev-parse", "HEAD^{tree}");
  await git(root, "switch", "-c", "feature");
  await writeFile(join(root, "tracked.txt"), "feature\n", "utf8");
  await git(root, "commit", "-am", "feature");
  const target = createReviewTarget({
    schemaVersion: 2,
    semanticsVersion: "review-gate/v2",
    kind: "change-set",
    repositoryId: "12345678-1234-1234-1234-123456789abc",
    baseRef: "main",
    diffBaseSha,
    diffBaseTree,
    headSha: await git(root, "rev-parse", "HEAD"),
    headTree: await git(root, "rev-parse", "HEAD^{tree}"),
  });
  const source = await createLocalReviewSourceDescriptor({
    exec,
    cwd: root,
    operationId: `local-${"a".repeat(64)}`,
    target,
  });
  return { root, target, source };
}

describe("immutable local review materialization", () => {
  it("pins and checks out the exact target while the caller branch moves", async () => {
    const records = await fixture();
    const materialized = await ensureLocalReviewSourceMaterialized({ exec, source: records.source });

    expect(materialized.reviewRoot).toBe(records.source.materializationRef);
    expect(await git(materialized.reviewRoot, "rev-parse", "HEAD")).toBe(records.target.headSha);
    expect(await git(materialized.reviewRoot, "rev-parse", "HEAD^{tree}")).toBe(records.target.headTree);
    expect(await git(materialized.reviewRoot, "status", "--porcelain=v2")).toBe("");

    await writeFile(join(records.root, "tracked.txt"), "moved\n", "utf8");
    await git(records.root, "commit", "-am", "move caller");
    await git(records.root, "reset", "--hard", records.target.headSha);

    await expect(ensureLocalReviewSourceMaterialized({
      exec,
      source: records.source,
    })).resolves.toEqual(materialized);
    await expect(readFile(join(materialized.reviewRoot, "tracked.txt"), "utf8")).resolves.toBe("feature\n");
  });

  it("repairs missing locators without mutating evaluator outputs and rejects tracked drift", async () => {
    const records = await fixture();
    await ensureLocalReviewSourceMaterialized({ exec, source: records.source });

    await git(records.root, "update-ref", "-d", records.source.reachabilityRef);
    await writeFile(join(records.source.materializationRef, "untracked.txt"), "dirty\n", "utf8");
    await writeFile(await git(
      records.source.materializationRef,
      "rev-parse",
      "--git-path",
      "info/exclude",
    ), "ignored.txt\n", "utf8");
    await writeFile(join(records.source.materializationRef, "ignored.txt"), "review result\n", "utf8");
    await ensureLocalReviewSourceMaterialized({ exec, source: records.source });
    expect(await git(records.root, "rev-parse", records.source.reachabilityRef)).toBe(records.target.headSha);
    await expect(readFile(join(records.source.materializationRef, "untracked.txt"), "utf8"))
      .resolves.toBe("dirty\n");
    await expect(readFile(join(records.source.materializationRef, "ignored.txt"), "utf8"))
      .resolves.toBe("review result\n");

    await writeFile(join(records.source.materializationRef, "tracked.txt"), "changed\n", "utf8");
    await expect(ensureLocalReviewSourceMaterialized({
      exec,
      source: records.source,
    })).rejects.toMatchObject({ code: "corrupt-state", reason: "checkout-dirty" });
    await expect(readFile(join(records.source.materializationRef, "tracked.txt"), "utf8"))
      .resolves.toBe("changed\n");

    await git(records.root, "update-ref", records.source.reachabilityRef, records.target.diffBaseSha);
    await expect(ensureLocalReviewSourceMaterialized({
      exec,
      source: records.source,
    })).rejects.toBeInstanceOf(LocalReviewMaterializationError);
    await expect(ensureLocalReviewSourceMaterialized({
      exec,
      source: records.source,
    })).rejects.toMatchObject({ code: "corrupt-state", reason: "pin-target-mismatch" });
  });

  it("retains and recreates the exact source after branch deletion and Git maintenance", async () => {
    const records = await fixture();
    await ensureLocalReviewSourceMaterialized({ exec, source: records.source });
    await git(records.root, "worktree", "remove", records.source.materializationRef);
    await git(records.root, "switch", "main");
    await git(records.root, "branch", "-D", "feature");
    await git(records.root, "reflog", "expire", "--expire=now", "--all");
    await git(records.root, "gc", "--prune=now");

    expect(await git(records.root, "cat-file", "-e", `${records.target.headSha}^{commit}`)).toBe("");
    const restored = await ensureLocalReviewSourceMaterialized({ exec, source: records.source });
    expect(restored.reviewRoot).toBe(records.source.materializationRef);
    expect(await git(restored.reviewRoot, "rev-parse", "HEAD")).toBe(records.target.headSha);
    expect(await git(restored.reviewRoot, "status", "--porcelain=v2")).toBe("");
  });

  it("reports corrupt state when an unpinned exact source has been pruned", async () => {
    const records = await fixture();
    await git(records.root, "switch", "main");
    await git(records.root, "branch", "-D", "feature");
    await git(records.root, "reflog", "expire", "--expire=now", "--all");
    await git(records.root, "gc", "--prune=now");

    await expect(git(records.root, "cat-file", "-e", `${records.target.headSha}^{commit}`)).rejects.toThrow();
    await expect(ensureLocalReviewSourceMaterialized({
      exec,
      source: records.source,
    })).rejects.toMatchObject({
      code: "corrupt-state",
      reason: `missing-object:${records.target.headSha}`,
    });
  });

  it("distinguishes an intact materialization from a released one without restoring it", async () => {
    const records = await fixture();
    await ensureLocalReviewSourceMaterialized({ exec, source: records.source });

    await expect(inspectLocalReviewSourceMaterialization({
      exec,
      source: records.source,
    })).resolves.toBe("materialized");

    await git(records.root, "worktree", "remove", records.source.materializationRef);
    await git(records.root, "update-ref", "-d", records.source.reachabilityRef);

    await expect(inspectLocalReviewSourceMaterialization({
      exec,
      source: records.source,
    })).resolves.toBe("absent");
  });

  it("idempotently releases the exact checkout and reachability pin under concurrent cleanup", async () => {
    const records = await fixture();
    await ensureLocalReviewSourceMaterialized({ exec, source: records.source });
    const operationId = records.source.reachabilityRef.split("/").at(-1);
    if (operationId === undefined) throw new Error("missing operation identity");
    const sweep = new RepositoryLocalReviewSourceSweepAdapter(exec, records.root);

    await Promise.all([
      sweep.release(operationId),
      sweep.release(operationId),
    ]);

    await expect(inspectLocalReviewSourceMaterialization({
      exec,
      source: records.source,
    })).resolves.toBe("absent");
    await expect(git(records.root, "show-ref", "--verify", records.source.reachabilityRef)).rejects.toThrow();
    await expect(readFile(join(records.source.materializationRef, "tracked.txt"), "utf8"))
      .rejects.toMatchObject({ code: "ENOENT" });
  });
});
