/** Git ref and detached-worktree materialization for immutable local review sources. */

import { mkdir, stat } from "node:fs/promises";
import { dirname, join } from "node:path";

import type { GitExec } from "../../../../lib/git/exec.js";
import { resolveGitCommonDir } from "../../../../lib/user-sync/repo-shared-paths.js";
import {
  createLocalReviewSource,
  LocalReviewSourceSchema,
  type LocalReviewSource,
} from "../../core/local-review-source.js";
import {
  ReviewIdentifierSchema,
  type ReviewTarget,
} from "../../core/gate-contract-v2-schema.js";
import type { IncrementalReviewScope } from "../../core/incremental-review-scope.js";

/** Stable failure when a persisted materialization contradicts its source descriptor. */
export class LocalReviewMaterializationError extends Error {
  constructor(
    public readonly reason: string,
    public readonly code: "corrupt-state" | "scope-unavailable" = "corrupt-state",
  ) {
    super(reason);
    this.name = "LocalReviewMaterializationError";
  }
}

async function git(exec: GitExec, cwd: string, args: string[]): Promise<string> {
  return (await exec("git", args, { cwd })).stdout.trim();
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

async function objectExists(exec: GitExec, cwd: string, revision: string): Promise<boolean> {
  try {
    await git(exec, cwd, ["cat-file", "-e", revision]);
    return true;
  } catch {
    return false;
  }
}

/**
 * Constructs deterministic operational locators for an exact local source.
 *
 * @param input - Repository, operation identity, and exact review target.
 * @returns The immutable source descriptor before any pin is created.
 */
export async function createLocalReviewSourceDescriptor(input: {
  exec: GitExec;
  cwd: string;
  operationId: string;
  target: ReviewTarget;
  correctionScope?: IncrementalReviewScope;
}): Promise<LocalReviewSource> {
  const operationId = ReviewIdentifierSchema.parse(input.operationId);
  const commonDir = await resolveGitCommonDir(input.exec, input.cwd);
  const objectFormat = await git(input.exec, input.cwd, ["rev-parse", "--show-object-format"]);
  if (objectFormat !== "sha1" && objectFormat !== "sha256") {
    throw new LocalReviewMaterializationError("unsupported-object-format");
  }
  return createLocalReviewSource({
    schemaVersion: 1,
    semanticsVersion: "git-object-range/v1",
    repositoryId: input.target.repositoryId,
    targetId: input.target.targetId,
    objectFormat,
    diffBaseSha: input.target.diffBaseSha,
    diffBaseTree: input.target.diffBaseTree,
    headSha: input.target.headSha,
    headTree: input.target.headTree,
    ...(input.correctionScope === undefined ? {} : {
      correctionScope: input.correctionScope,
      predecessorReachabilityRef: `refs/arc/review/local-scope/${operationId}/predecessor`,
      basisReachabilityRef: `refs/arc/review/local-scope/${operationId}/basis`,
    }),
    reachabilityRef: `refs/arc/review/local/${operationId}`,
    materializationRef: join(commonDir, "arc", "review-gate", "materializations", operationId),
  });
}

async function requireObjects(exec: GitExec, source: LocalReviewSource): Promise<void> {
  const repositoryCwd = source.materializationRef;
  const commonCwd = dirname(dirname(dirname(dirname(source.materializationRef))));
  const checks = [
    [source.diffBaseSha, `${source.diffBaseSha}^{commit}`],
    [source.headSha, `${source.headSha}^{commit}`],
    [source.diffBaseTree, `${source.diffBaseTree}^{tree}`],
    [source.headTree, `${source.headTree}^{tree}`],
  ] as const;
  for (const [label, revision] of checks) {
    if (!await objectExists(exec, commonCwd, revision)) {
      throw new LocalReviewMaterializationError(`missing-object:${label}`);
    }
  }
  if (source.correctionScope !== undefined) {
    for (const objectId of [
      source.correctionScope.predecessorHeadSha,
      source.correctionScope.basisHeadSha,
    ]) {
      if (!await objectExists(exec, commonCwd, `${objectId}^{commit}`)) {
        throw new LocalReviewMaterializationError(
          `missing-scope-object:${objectId}`,
          "scope-unavailable",
        );
      }
    }
  }
  void repositoryCwd;
}

async function ensureExactPin(
  exec: GitExec,
  cwd: string,
  reference: string,
  objectId: string,
): Promise<void> {
  let pinned: string | null = null;
  try {
    pinned = await git(exec, cwd, ["show-ref", "--verify", "--hash", reference]);
  } catch {
    // A missing private ref is the recoverable publication-before-pin case.
  }
  if (pinned !== null && pinned !== objectId) {
    throw new LocalReviewMaterializationError("pin-target-mismatch");
  }
  if (pinned === null) {
    await git(exec, cwd, ["update-ref", reference, objectId]);
  }
}

async function ensurePins(exec: GitExec, source: LocalReviewSource): Promise<void> {
  const cwd = dirname(dirname(dirname(dirname(source.materializationRef))));
  await ensureExactPin(exec, cwd, source.reachabilityRef, source.headSha);
  if (source.correctionScope !== undefined) {
    await ensureExactPin(
      exec,
      cwd,
      source.predecessorReachabilityRef as string,
      source.correctionScope.predecessorHeadSha,
    );
    await ensureExactPin(
      exec,
      cwd,
      source.basisReachabilityRef as string,
      source.correctionScope.basisHeadSha,
    );
  }
}

async function isGitWorktree(exec: GitExec, path: string): Promise<boolean> {
  try {
    await git(exec, path, ["rev-parse", "--is-inside-work-tree"]);
    return true;
  } catch {
    return false;
  }
}

async function ensureCheckout(exec: GitExec, source: LocalReviewSource): Promise<void> {
  const reviewRoot = source.materializationRef;
  if (await isGitWorktree(exec, reviewRoot)) return;
  if (await pathExists(reviewRoot)) {
    throw new LocalReviewMaterializationError("materialization-path-occupied");
  }
  await mkdir(dirname(reviewRoot), { recursive: true, mode: 0o700 });
  const cwd = dirname(dirname(dirname(dirname(reviewRoot))));
  await git(exec, cwd, ["worktree", "add", "--detach", reviewRoot, source.headSha]);
}

async function verifyCheckout(exec: GitExec, source: LocalReviewSource): Promise<void> {
  const reviewRoot = source.materializationRef;
  const head = await git(exec, reviewRoot, ["rev-parse", "HEAD"]);
  const tree = await git(exec, reviewRoot, ["rev-parse", "HEAD^{tree}"]);
  const branch = await git(exec, reviewRoot, ["rev-parse", "--abbrev-ref", "HEAD"]);
  const status = await git(exec, reviewRoot, ["status", "--porcelain=v2", "--untracked-files=no"]);
  if (head !== source.headSha) throw new LocalReviewMaterializationError("checkout-head-mismatch");
  if (tree !== source.headTree) throw new LocalReviewMaterializationError("checkout-tree-mismatch");
  if (branch !== "HEAD") throw new LocalReviewMaterializationError("checkout-not-detached");
  if (status !== "") throw new LocalReviewMaterializationError("checkout-dirty");
}

/**
 * Prove an existing materialization without repairing a released source.
 *
 * @param input - Git boundary and validated source descriptor.
 * @returns `absent` when either owned locator was released, otherwise `materialized`.
 */
export async function inspectLocalReviewSourceMaterialization(input: {
  exec: GitExec;
  source: LocalReviewSource;
}): Promise<"materialized" | "absent"> {
  const source = LocalReviewSourceSchema.parse(input.source);
  const cwd = dirname(dirname(dirname(dirname(source.materializationRef))));
  let pinned: string;
  try {
    pinned = await git(input.exec, cwd, ["show-ref", "--verify", "--hash", source.reachabilityRef]);
  } catch {
    return "absent";
  }
  if (pinned !== source.headSha) throw new LocalReviewMaterializationError("pin-target-mismatch");
  if (source.correctionScope !== undefined) {
    for (const [reference, objectId] of [
      [source.predecessorReachabilityRef as string, source.correctionScope.predecessorHeadSha],
      [source.basisReachabilityRef as string, source.correctionScope.basisHeadSha],
    ] as const) {
      let correctionPin: string;
      try {
        correctionPin = await git(input.exec, cwd, ["show-ref", "--verify", "--hash", reference]);
      } catch {
        return "absent";
      }
      if (correctionPin !== objectId) throw new LocalReviewMaterializationError("pin-target-mismatch");
    }
  }
  if (!await pathExists(source.materializationRef)) return "absent";
  if (!await isGitWorktree(input.exec, source.materializationRef)) {
    throw new LocalReviewMaterializationError("materialization-not-worktree");
  }
  await requireObjects(input.exec, source);
  try {
    await verifyCheckout(input.exec, source);
  } catch (error) {
    if (error instanceof LocalReviewMaterializationError) throw error;
    throw new LocalReviewMaterializationError("materialization-unreadable");
  }
  return "materialized";
}

/**
 * Restores and proves the operation-owned pin and detached exact-head checkout.
 *
 * @param input - Git boundary and validated source descriptor.
 * @returns The immutable review root.
 */
export async function ensureLocalReviewSourceMaterialized(input: {
  exec: GitExec;
  source: LocalReviewSource;
}): Promise<{ reviewRoot: string }> {
  const source = LocalReviewSourceSchema.parse(input.source);
  await requireObjects(input.exec, source);
  await ensurePins(input.exec, source);
  await ensureCheckout(input.exec, source);
  await verifyCheckout(input.exec, source);
  const pinned = await git(
    input.exec,
    dirname(dirname(dirname(dirname(source.materializationRef)))),
    ["show-ref", "--verify", "--hash", source.reachabilityRef],
  );
  if (pinned !== source.headSha) throw new LocalReviewMaterializationError("pin-target-mismatch");
  return { reviewRoot: source.materializationRef };
}
