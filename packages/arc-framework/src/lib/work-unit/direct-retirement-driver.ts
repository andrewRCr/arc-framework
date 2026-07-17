/**
 * Git/filesystem binding for direct-transition retirement drivers.
 *
 * The binding captures the committed source artifact group before removal or
 * relocation, limits staging to typed source/result paths plus the generated
 * readiness view, and composes in-repository snapshot/record operations behind
 * the authority port.
 */

import { join, posix, resolve } from "node:path";

import { canonicalDigest, canonicalize } from "../canonical/canonical-json.js";
import {
  contentDigest,
  deleteOperation,
  writeOperation,
  type ArtifactSetEntry,
  type PatchOperation,
} from "../canonical/content-digest.js";
import { artifactGroupDigest, receiptId } from "../canonical/receipt-id.js";
import { validateManagedPath, type ManagedPath } from "../canonical/managed-path.js";
import { getCurrentBranch, type GitExec } from "../git/exec.js";
import { acquireAdvisoryLock, releaseAdvisoryLock } from "../user-sync/notes-lock.js";
import {
  validateReceiptMatrix,
  type RetirementAuthorityScope,
  type RetirementReceipt,
} from "./retirement-authority.js";
import { readRetirementAuthoritySnapshot } from "./retirement-authority-snapshot.js";
import { recordRetirementReceipt } from "./retirement-record.js";
import { resolveRetirementRecordPath } from "./retirement-record-store.js";
import { artifactMatcher } from "./mutators/relocate-artifacts.js";
import type { AbandonRetirementContext } from "./verbs/abandon.js";
import type { ParkPlanningRetirementContext } from "./verbs/park-resume.js";

const ROADMAP_PATH = validateManagedPath(".arc/backlog/ROADMAP.md");

/** Exact Git blob reader; a null ref addresses the current index. */
export type RetirementBlobReader = (
  ref: string | null,
  path: ManagedPath,
) => Promise<Uint8Array | null>;

/** Production boundaries needed by an in-repository direct-transition binding. */
export interface InRepoDirectRetirementDeps {
  cwd: string;
  exec: GitExec;
  readBlob: RetirementBlobReader;
  readFile(path: string): Promise<string>;
  createRecord(receiptId: RetirementReceipt["receiptId"], content: string): Promise<void>;
  removeRecord(receiptId: RetirementReceipt["receiptId"]): Promise<void>;
}

interface DirectTransitionSourceEvidence {
  scope: RetirementAuthorityScope;
  artifactDigest: RetirementReceipt["source"]["artifactDigest"];
  sourceArtifactPaths: readonly ManagedPath[];
  resultArtifactPaths: readonly ManagedPath[];
}

interface CapturedDirectSource extends DirectTransitionSourceEvidence {
  inventory: readonly ArtifactSetEntry[];
}

interface SnapshotBinding {
  scope: RetirementAuthorityScope;
  source: CapturedDirectSource;
  authorityVersion: string;
}

interface DirectTransitionConfig {
  transition: "abandon" | "park-planning";
  expectedLifecycle: "nonexistent" | "planned";
  label: "abandon" | "park";
}

interface DirectTransitionRetirementContext {
  authority: AbandonRetirementContext["authority"];
  captureSource(params: {
    name: string;
    sourceDir: string;
    resultDir: string | null;
    expectedBranch: string | null;
  }): Promise<DirectTransitionSourceEvidence>;
  stageTransition(source: DirectTransitionSourceEvidence): Promise<void>;
  rollbackTransition(source: DirectTransitionSourceEvidence): Promise<void>;
  readTransitionPatch(source: DirectTransitionSourceEvidence): Promise<readonly PatchOperation[]>;
  readResultArtifactDigest(
    source: DirectTransitionSourceEvidence,
  ): Promise<RetirementReceipt["source"]["artifactDigest"]>;
}

function createInRepoDirectRetirementContext(
  deps: InRepoDirectRetirementDeps,
  config: DirectTransitionConfig,
): DirectTransitionRetirementContext {
  let captured: CapturedDirectSource | null = null;
  const snapshots = new Map<string, SnapshotBinding>();

  const captureSource: DirectTransitionRetirementContext["captureSource"] = async ({
    name,
    sourceDir,
    resultDir,
    expectedBranch,
  }) => {
    const branch = await getCurrentBranch(deps.exec);
    if (branch === null) {
      throw new Error(`${config.label} retirement evidence requires an attached source branch`);
    }
    if (expectedBranch !== null && expectedBranch !== "[none]" && branch !== expectedBranch) {
      throw new Error(`${config.label} must run from the source branch \`${expectedBranch}\`, not \`${branch}\``);
    }
    const head = await resolveBranchHead(deps.exec, deps.cwd, branch);
    const paths = await listArtifactPaths(deps.exec, deps.cwd, head, sourceDir, name);
    const inventory = await Promise.all(paths.map(async (path): Promise<ArtifactSetEntry> => {
      const bytes = await deps.readBlob(head, path);
      if (bytes === null) throw new Error(`source artifact disappeared from ${head}: ${path}`);
      return { path, state: "present", contentDigest: contentDigest(bytes) };
    }));
    const evidence: CapturedDirectSource = {
      scope: {
        subject: { kind: "work-unit", name },
        transition: config.transition,
        source: { branch, head },
        resultProjection: { ref: branch, head },
      },
      artifactDigest: artifactGroupDigest(inventory),
      sourceArtifactPaths: paths,
      resultArtifactPaths: resultDir === null
        ? []
        : paths.map((path) => validateManagedPath(posix.join(resultDir, posix.basename(path)))),
      inventory,
    };
    captured = evidence;
    return evidence;
  };

  const readTransitionPatch = async (
    source: DirectTransitionSourceEvidence,
  ): Promise<readonly PatchOperation[]> => {
    const bound = requireCaptured(captured, source);
    const operations: PatchOperation[] = [];
    for (const path of bound.sourceArtifactPaths) {
      if (await deps.readBlob(null, path) !== null) {
        throw new Error(`${config.label} transition left source artifact in the index: ${path}`);
      }
      operations.push(deleteOperation(path));
    }
    for (const path of bound.resultArtifactPaths) {
      const bytes = await deps.readBlob(null, path);
      if (bytes === null) throw new Error(`${config.label} transition omitted result artifact: ${path}`);
      operations.push(writeOperation(path, bytes));
    }

    const [beforeRoadmap, afterRoadmap] = await Promise.all([
      deps.readBlob(bound.scope.source.head, ROADMAP_PATH),
      deps.readBlob(null, ROADMAP_PATH),
    ]);
    if (!bytesEqual(beforeRoadmap, afterRoadmap)) {
      if (afterRoadmap === null) operations.push(deleteOperation(ROADMAP_PATH));
      else operations.push(writeOperation(ROADMAP_PATH, afterRoadmap));
    }
    return operations;
  };

  const readResultArtifactDigest = async (
    source: DirectTransitionSourceEvidence,
  ): Promise<RetirementReceipt["source"]["artifactDigest"]> => {
    const bound = requireCaptured(captured, source);
    const inventory = await Promise.all(bound.resultArtifactPaths.map(async (path): Promise<ArtifactSetEntry> => {
      const bytes = await deps.readBlob(null, path);
      if (bytes === null) throw new Error(`${config.label} transition omitted result artifact: ${path}`);
      return { path, state: "present", contentDigest: contentDigest(bytes) };
    }));
    return artifactGroupDigest(inventory);
  };

  const authority: DirectTransitionRetirementContext["authority"] = {
    readSnapshot: async (scope) => {
      const source = requireCaptured(captured, { scope });
      const staged = await readStagedPaths(deps.exec, deps.cwd);
      if (staged.length > 0) return { status: "refused", reason: "evidence-mismatch" };
      const result = await readRetirementAuthoritySnapshot(
        {
          cwd: deps.cwd,
          exec: deps.exec,
          fs: { readFile: (path) => deps.readFile(path) },
          readInventory: () => Promise.resolve(source.inventory),
        },
        scope,
      );
      if (result.status === "resolved") {
        snapshots.set(result.snapshot.authorityVersion, {
          scope,
          source,
          authorityVersion: result.snapshot.authorityVersion,
        });
      }
      return result;
    },
    record: async (receipt, expectedAuthorityVersion) => {
      const binding = snapshots.get(expectedAuthorityVersion);
      if (binding === undefined || !(await receiptMatchesBinding(receipt, binding, config, readResultArtifactDigest))) {
        return { status: "refused", reason: "authority-conflict" };
      }
      return await recordRetirementReceipt(
        {
          cwd: deps.cwd,
          withTransaction: (operation) => withRetirementTransaction(deps, operation),
          readAuthorityVersion: async () => {
            const [sourceOid, resultOid, branch] = await Promise.all([
              resolveBranchHead(deps.exec, deps.cwd, binding.scope.source.branch),
              resolveBranchHead(deps.exec, deps.cwd, binding.scope.resultProjection.ref),
              getCurrentBranch(deps.exec),
            ]);
            return sourceOid === binding.scope.source.head
              && resultOid === binding.scope.resultProjection.head
              && branch === binding.scope.source.branch
              ? binding.authorityVersion
              : `${binding.authorityVersion}:conflict`;
          },
          readRecordedAuthorityVersion: async () => canonicalDigest({
            schemaVersion: 1,
            sourceOid: await resolveBranchHead(deps.exec, deps.cwd, binding.scope.source.branch),
            resultOid: await resolveBranchHead(deps.exec, deps.cwd, binding.scope.resultProjection.ref),
            branch: await getCurrentBranch(deps.exec),
            stagedPaths: await readStagedPaths(deps.exec, deps.cwd),
            receipt: await deps.readFile(resolveRetirementRecordPath(deps.cwd, receipt.receiptId)),
          }),
          readStagedPaths: () => readStagedPaths(deps.exec, deps.cwd),
          readTransitionPatch: () => readTransitionPatch(binding.source),
          createRecord: (receiptId, content) => deps.createRecord(receiptId, content),
          removeRecord: (receiptId) => deps.removeRecord(receiptId),
          stagePaths: (paths) => stageUnstagedPaths(deps.exec, deps.cwd, paths),
          rollbackPaths: (paths) => unstagePaths(deps.exec, deps.cwd, paths),
        },
        receipt,
        expectedAuthorityVersion,
      );
    },
  };

  return {
    authority,
    captureSource,
    stageTransition: async (source) => {
      const bound = requireCaptured(captured, source);
      await stageUnstagedPaths(
        deps.exec,
        deps.cwd,
        [...bound.sourceArtifactPaths, ...bound.resultArtifactPaths, ROADMAP_PATH],
      );
    },
    rollbackTransition: async (source) => {
      const bound = requireCaptured(captured, source);
      await restoreTransition(deps.exec, deps.cwd, bound);
    },
    readTransitionPatch,
    readResultArtifactDigest,
  };
}

/** Build the direct-transition binding used by `runAbandon`. */
export function createInRepoAbandonRetirementContext(
  deps: InRepoDirectRetirementDeps,
): AbandonRetirementContext {
  const direct = createInRepoDirectRetirementContext(deps, {
    transition: "abandon",
    expectedLifecycle: "nonexistent",
    label: "abandon",
  });
  return {
    authority: direct.authority,
    captureSource: (params) => direct.captureSource({ ...params, resultDir: null }),
    stageTransition: (source) => direct.stageTransition(source),
    rollbackTransition: (source) => direct.rollbackTransition(source),
    readTransitionPatch: (source) => direct.readTransitionPatch(source),
  };
}

/** Build the direct-transition binding used by park-at-Planning. */
export function createInRepoParkPlanningRetirementContext(
  deps: InRepoDirectRetirementDeps,
): ParkPlanningRetirementContext {
  const direct = createInRepoDirectRetirementContext(deps, {
    transition: "park-planning",
    expectedLifecycle: "planned",
    label: "park",
  });
  return {
    authority: direct.authority,
    captureSource: (params) => direct.captureSource(params),
    stageTransition: (source) => direct.stageTransition(source),
    rollbackTransition: (source) => direct.rollbackTransition(source),
    readTransitionPatch: (source) => direct.readTransitionPatch(source),
    readResultArtifactDigest: (source) => direct.readResultArtifactDigest(source),
  };
}

function requireCaptured(
  captured: CapturedDirectSource | null,
  source: Pick<DirectTransitionSourceEvidence, "scope">,
): CapturedDirectSource {
  if (captured === null || canonicalScope(captured.scope) !== canonicalScope(source.scope)) {
    throw new Error("retirement source does not match the captured projection");
  }
  return captured;
}

function canonicalScope(scope: RetirementAuthorityScope): string {
  return canonicalize(scope);
}

async function receiptMatchesBinding(
  receipt: RetirementReceipt,
  binding: SnapshotBinding,
  config: DirectTransitionConfig,
  readResultArtifactDigest: DirectTransitionRetirementContext["readResultArtifactDigest"],
): Promise<boolean> {
  const resultMatches = config.transition === "abandon"
    ? receipt.result.kind === "discard"
    : receipt.result.kind === "relocate"
      && receipt.result.plannedArtifactDigest === await readResultArtifactDigest(binding.source);
  return receipt.transition === config.transition
    && receipt.receiptId === receiptId({
      schemaVersion: receipt.schemaVersion,
      subject: receipt.subject,
      transition: receipt.transition,
      sourceBranch: receipt.source.branch,
      sourceHead: receipt.source.head,
    })
    && receipt.source.branch === binding.scope.source.branch
    && receipt.source.head === binding.scope.source.head
    && receipt.source.artifactDigest === binding.source.artifactDigest
    && receipt.retiringProjection.kind === "direct-transition"
    && validateReceiptMatrix(receipt, config.expectedLifecycle) === null
    && resultMatches
    && receipt.subject.kind === "work-unit"
    && binding.scope.subject.kind === "work-unit"
    && receipt.subject.name === binding.scope.subject.name;
}

async function resolveBranchHead(exec: GitExec, cwd: string, branch: string): Promise<string> {
  const ref = `refs/heads/${branch}`;
  const { stdout } = await exec("git", ["rev-parse", "--verify", `${ref}^{commit}`], { cwd });
  const oid = stdout.trim();
  if (oid === "") throw new Error(`could not resolve commit: ${ref}`);
  return oid;
}

async function listArtifactPaths(
  exec: GitExec,
  cwd: string,
  ref: string,
  sourceDir: string,
  name: string,
): Promise<ManagedPath[]> {
  const { stdout } = await exec(
    "git",
    ["ls-tree", "--full-tree", "-r", "-z", "--name-only", ref, "--", sourceDir],
    { cwd },
  );
  const matcher = artifactMatcher(name);
  return stdout
    .split("\0")
    .filter((path) => path !== "" && posix.dirname(path) === sourceDir && matcher.test(posix.basename(path)))
    .map(validateManagedPath)
    .sort((left, right) => Buffer.compare(Buffer.from(left, "utf8"), Buffer.from(right, "utf8")));
}

async function readStagedPaths(exec: GitExec, cwd: string): Promise<string[]> {
  const { stdout } = await exec(
    "git",
    ["diff", "--cached", "--name-only", "--no-renames", "-z"],
    { cwd },
  );
  return stdout.split("\0").filter((path) => path !== "");
}

async function stagePaths(exec: GitExec, cwd: string, paths: readonly string[]): Promise<void> {
  if (paths.length === 0) return;
  await exec("git", ["add", "-A", "--", ...paths], { cwd });
}

async function stageUnstagedPaths(exec: GitExec, cwd: string, paths: readonly string[]): Promise<void> {
  const alreadyStaged = new Set(await readStagedPaths(exec, cwd));
  await stagePaths(exec, cwd, paths.filter((path) => !alreadyStaged.has(path)));
}

async function unstagePaths(exec: GitExec, cwd: string, paths: readonly string[]): Promise<void> {
  if (paths.length === 0) return;
  await exec("git", ["restore", "--staged", "--", ...paths], { cwd });
}

async function restoreTransition(
  exec: GitExec,
  cwd: string,
  source: CapturedDirectSource,
): Promise<void> {
  const paths = [
    ...source.sourceArtifactPaths,
    ...source.resultArtifactPaths,
    ROADMAP_PATH,
  ];
  await exec(
    "git",
    ["restore", `--source=${source.scope.source.head}`, "--staged", "--worktree", "--", ...paths],
    { cwd },
  );
}

async function withRetirementTransaction<T>(
  deps: InRepoDirectRetirementDeps,
  operation: () => Promise<T>,
): Promise<T> {
  const { stdout } = await deps.exec("git", ["rev-parse", "--git-common-dir"], { cwd: deps.cwd });
  const gitCommonDir = stdout.trim();
  if (gitCommonDir === "") throw new Error("Git did not resolve its common directory.");
  const handle = await acquireAdvisoryLock(
    join(resolve(deps.cwd, gitCommonDir), "arc-retirement-record.lock"),
  );
  try {
    return await operation();
  } finally {
    await releaseAdvisoryLock(handle);
  }
}

function bytesEqual(left: Uint8Array | null, right: Uint8Array | null): boolean {
  if (left === null || right === null) return left === right;
  return Buffer.compare(Buffer.from(left), Buffer.from(right)) === 0;
}
