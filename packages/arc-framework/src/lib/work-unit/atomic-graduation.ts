/**
 * Start-only atomic application and rollback of one validated graduation.
 *
 * @module
 */

import { join, posix } from "node:path";

import { digestBytes } from "../canonical/canonical-json.js";
import {
  captureGitIndexState,
  type GitExec,
  type GitIndexTransaction,
} from "../git/exec.js";
import { parseGitWorktreePorcelain } from "../git/worktree-porcelain.js";
import type {
  GraduationStoredArtifact,
  ValidatedGraduationTransaction,
} from "./validated-graduation-transaction.js";
import type {
  ProvisionSpawnedWorktreeOp,
} from "./mutators/reconcile-work-unit-worktree.js";
import type { WorkUnitLocusDriver, WorkUnitLocusReceipt } from "./work-unit-locus.js";

/** Filesystem mechanics required by {@link atomicGraduate}. */
export interface AtomicGraduationFs {
  chmod(path: string, mode: number): Promise<unknown>;
  mkdir(path: string, options: { recursive: true }): Promise<unknown>;
  readFile(path: string): Promise<Uint8Array>;
  rename(from: string, to: string): Promise<void>;
  rm(path: string, options: { force: true; recursive?: boolean }): Promise<void>;
  rmdir(path: string): Promise<void>;
  stat(path: string): Promise<{ mode: number }>;
  writeFile(path: string, content: Uint8Array): Promise<unknown>;
}

/** Production boundaries for the start-only atomic graduation port. */
export interface AtomicGraduationDependencies {
  cwd: string;
  exec: GitExec;
  fs: AtomicGraduationFs;
  captureIndex?: typeof captureGitIndexState;
  provisionSpawnedWorktree?: (op: ProvisionSpawnedWorktreeOp) => Promise<string | null>;
  workUnitLocus?: WorkUnitLocusDriver;
}

/** One exact rollback mismatch or failed restoration operation. */
export interface GraduationRollbackFailure {
  stage: "index" | "path" | "worktree" | "branch" | "locus" | "verification";
  locus: string;
  detail: string;
}

/** Non-authoritative residue returned only when exact rollback cannot be proven. */
export interface GraduationRecoveryResidue {
  slug: string;
  branch: string;
  mode: "spawned" | "in-place";
  failures: GraduationRollbackFailure[];
}

/** Closed result of applying one graduation transaction. */
export type AtomicGraduationResult =
  | { status: "applied"; worktreePath: string; postCreateNotice: string | null }
  | { status: "rejected"; reason: string }
  | {
    status: "graduation-recovery-required";
    reason: string;
    residue: GraduationRecoveryResidue;
  };

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function comparePaths(left: string, right: string): number {
  return Buffer.compare(Buffer.from(left), Buffer.from(right));
}

async function optionalBytes(fs: AtomicGraduationFs, path: string): Promise<Uint8Array | null> {
  try {
    return new Uint8Array(await fs.readFile(path));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

async function pathExists(fs: AtomicGraduationFs, path: string): Promise<boolean> {
  try {
    await fs.stat(path);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw error;
  }
}

function modeNumber(mode: GraduationStoredArtifact["mode"]): number {
  return mode === "100755" ? 0o755 : 0o644;
}

function observedMode(mode: number): GraduationStoredArtifact["mode"] {
  return (mode & 0o111) === 0 ? "100644" : "100755";
}

async function branchTip(exec: GitExec, cwd: string, ref: string): Promise<string | null> {
  const { stdout } = await exec("git", ["for-each-ref", "--format=%(objectname)", ref], { cwd });
  const tips = stdout.split("\n").filter(Boolean);
  if (tips.length > 1) throw new Error(`Git returned duplicate branch facts for ${ref}.`);
  return tips[0] ?? null;
}

async function indexTree(exec: GitExec, cwd: string, indexFile?: string): Promise<string> {
  const { stdout } = await exec("git", ["write-tree"], { cwd, indexFile });
  const tree = stdout.trim();
  if (!/^[0-9a-f]{40}(?:[0-9a-f]{24})?$/u.test(tree)) throw new Error("Git returned an invalid index tree.");
  return tree;
}

async function verifyPaths(
  transaction: ValidatedGraduationTransaction,
  deps: AtomicGraduationDependencies,
  cwd: string,
  phase: "source" | "target",
): Promise<void> {
  for (const artifact of transaction.source.artifacts) {
    const sourcePath = join(cwd, artifact.sourcePath);
    const target = transaction.target.artifacts.find(({ basename }) => basename === artifact.basename);
    if (target === undefined) throw new Error(`Target artifact is missing from the transaction: ${artifact.basename}.`);
    const targetPath = join(cwd, target.targetPath);
    const sourceBytes = await optionalBytes(deps.fs, sourcePath);
    const targetBytes = await optionalBytes(deps.fs, targetPath);
    if (phase === "source") {
      if (sourceBytes === null
        || digestBytes(sourceBytes) !== artifact.contentDigest
        || targetBytes !== null
        || observedMode((await deps.fs.stat(sourcePath)).mode) !== artifact.mode) {
        throw new Error(`Graduation source preimage changed: ${artifact.sourcePath}.`);
      }
    } else if (sourceBytes !== null
      || targetBytes === null
      || digestBytes(targetBytes) !== target.contentDigest
      || observedMode((await deps.fs.stat(targetPath)).mode) !== target.mode) {
      throw new Error(`Graduation target parity failed: ${target.targetPath}.`);
    }
  }
}

async function verifyIndex(
  transaction: ValidatedGraduationTransaction,
  deps: AtomicGraduationDependencies,
  cwd: string,
  indexFile?: string,
): Promise<void> {
  const paths = transaction.source.artifacts.flatMap(({ sourcePath, targetPath }) => [
    `:(literal)${sourcePath}`,
    `:(literal)${targetPath}`,
  ]);
  const { stdout } = await deps.exec("git", ["ls-files", "--stage", "-z", "--", ...paths], { cwd, indexFile });
  const entries = new Map<string, { mode: string; oid: string }>();
  for (const record of stdout.split("\0").filter(Boolean)) {
    const match = /^(100644|100755) ([0-9a-f]{40}(?:[0-9a-f]{24})?) 0\t(.+)$/u.exec(record);
    if (match?.[1] === undefined || match[2] === undefined || match[3] === undefined) {
      throw new Error("Graduation produced an invalid index entry.");
    }
    entries.set(match[3], { mode: match[1], oid: match[2] });
  }
  if (entries.size !== transaction.target.artifacts.length) {
    throw new Error("Graduation index contains an unexpected source or target entry.");
  }
  for (const target of transaction.target.artifacts) {
    const entry = entries.get(target.targetPath);
    if (entry?.mode !== target.mode) throw new Error(`Graduation index mode differs: ${target.targetPath}.`);
    const { stdout: hashed } = await deps.exec(
      "git",
      ["hash-object", "--no-filters", "--", join(cwd, target.targetPath)],
      { cwd },
    );
    if (entry.oid !== hashed.trim()) throw new Error(`Graduation index bytes differ: ${target.targetPath}.`);
  }
  const candidateTree = await indexTree(deps.exec, cwd, indexFile);
  const { stdout: changedOutput } = await deps.exec(
    "git",
    ["diff-tree", "--no-commit-id", "--name-only", "-r", "-z", transaction.occupation.indexTree, candidateTree],
    { cwd },
  );
  const changed = changedOutput.split("\0").filter(Boolean).sort(comparePaths);
  const expected = transaction.source.artifacts
    .flatMap(({ sourcePath, targetPath }) => [sourcePath, targetPath])
    .sort(comparePaths);
  if (changed.length !== expected.length
    || changed.some((path, index) => path !== expected[index])) {
    throw new Error("Graduation index delta differs from the validated source and target closure.");
  }
}

async function verifyInitialOccupation(
  transaction: ValidatedGraduationTransaction,
  deps: AtomicGraduationDependencies,
): Promise<void> {
  if (await branchTip(deps.exec, deps.cwd, transaction.occupation.branch.ref) !== null) {
    throw new Error(`Graduation branch is no longer absent: ${transaction.occupation.branch.ref}.`);
  }
  if (transaction.occupation.mode === "spawned") {
    const worktree = transaction.occupation.worktree;
    const { stdout } = await deps.exec("git", ["worktree", "list", "--porcelain"], { cwd: deps.cwd });
    const registered = parseGitWorktreePorcelain(stdout).some(({ path }) => path === worktree.path);
    if (worktree.kind !== "absent" || registered || await pathExists(deps.fs, worktree.path)) {
      throw new Error(`Graduation worktree destination is no longer absent: ${worktree.path}.`);
    }
    return;
  }
  const worktree = transaction.occupation.worktree;
  if (worktree.kind !== "current") throw new Error("In-place graduation lacks its current worktree preimage.");
  const [{ stdout: head }, { stdout: branch }, { stdout: top }] = await Promise.all([
    deps.exec("git", ["rev-parse", "HEAD"], { cwd: deps.cwd }),
    deps.exec("git", ["branch", "--show-current"], { cwd: deps.cwd }),
    deps.exec("git", ["rev-parse", "--show-toplevel"], { cwd: deps.cwd }),
  ]);
  if (head.trim() !== worktree.head
    || (branch.trim() || null) !== worktree.branch
    || top.trim() !== worktree.path
    || await indexTree(deps.exec, deps.cwd) !== transaction.occupation.indexTree) {
    throw new Error("In-place graduation occupation or index preimage changed.");
  }
  await verifyPaths(transaction, deps, deps.cwd, "source");
}

async function occupy(
  transaction: ValidatedGraduationTransaction,
  deps: AtomicGraduationDependencies,
): Promise<string> {
  const operation = transaction.occupation.operation;
  if (operation.kind === "spawned") {
    await deps.exec(
      "git",
      ["worktree", "add", operation.worktreePath, "-b", operation.branch, operation.base],
      { cwd: deps.cwd },
    );
    return operation.worktreePath;
  }
  await deps.exec("git", ["checkout", "-b", operation.branch, transaction.occupation.baseHead], { cwd: deps.cwd });
  return operation.worktreePath;
}

async function applyFiles(
  transaction: ValidatedGraduationTransaction,
  deps: AtomicGraduationDependencies,
  cwd: string,
): Promise<void> {
  await deps.fs.mkdir(join(cwd, transaction.target.directory), { recursive: true });
  for (const artifact of transaction.source.artifacts) {
    await deps.fs.rename(join(cwd, artifact.sourcePath), join(cwd, artifact.targetPath));
  }
  for (const target of transaction.target.artifacts) {
    const targetPath = join(cwd, target.targetPath);
    await deps.fs.writeFile(targetPath, target.bytes);
    await deps.fs.chmod(targetPath, modeNumber(target.mode));
  }
  await deps.fs.rmdir(join(cwd, transaction.source.directory)).catch(() => undefined);
}

async function stageFiles(
  transaction: ValidatedGraduationTransaction,
  deps: AtomicGraduationDependencies,
  cwd: string,
  index: GitIndexTransaction,
): Promise<void> {
  const pathspecs = transaction.source.artifacts.flatMap(({ sourcePath, targetPath }) => [
    `:(literal)${sourcePath}`,
    `:(literal)${targetPath}`,
  ]);
  await deps.exec("git", ["add", "-A", "--", ...pathspecs], { cwd, indexFile: index.indexFile });
}

async function restoreFiles(
  transaction: ValidatedGraduationTransaction,
  deps: AtomicGraduationDependencies,
  cwd: string,
  failures: GraduationRollbackFailure[],
): Promise<void> {
  for (const artifact of [...transaction.source.artifacts].reverse()) {
    try {
      await deps.fs.rm(join(cwd, artifact.targetPath), { force: true });
      await deps.fs.mkdir(join(cwd, posix.dirname(artifact.sourcePath)), { recursive: true });
      await deps.fs.writeFile(join(cwd, artifact.sourcePath), artifact.bytes);
      await deps.fs.chmod(join(cwd, artifact.sourcePath), modeNumber(artifact.mode));
    } catch (error) {
      failures.push({ stage: "path", locus: artifact.sourcePath, detail: errorMessage(error) });
    }
  }
  await deps.fs.rmdir(join(cwd, transaction.target.directory)).catch(() => undefined);
}

async function rollbackOccupation(
  transaction: ValidatedGraduationTransaction,
  deps: AtomicGraduationDependencies,
  occupiedCwd: string,
  failures: GraduationRollbackFailure[],
): Promise<void> {
  const operation = transaction.occupation.operation;
  if (operation.kind === "spawned") {
    const { stdout } = await deps.exec("git", ["worktree", "list", "--porcelain"], { cwd: deps.cwd });
    const registered = parseGitWorktreePorcelain(stdout).some(({ path }) => path === operation.worktreePath);
    if (registered) {
      try {
        await deps.exec("git", ["worktree", "remove", "--force", operation.worktreePath], { cwd: deps.cwd });
      } catch (error) {
        failures.push({ stage: "worktree", locus: operation.worktreePath, detail: errorMessage(error) });
        await deps.fs.rm(operation.worktreePath, { force: true, recursive: true }).catch(() => undefined);
      }
    } else if (await pathExists(deps.fs, operation.worktreePath)) {
      try {
        await deps.fs.rm(operation.worktreePath, { force: true, recursive: true });
      } catch (error) {
        failures.push({ stage: "worktree", locus: operation.worktreePath, detail: errorMessage(error) });
      }
    }
  } else {
    const before = transaction.occupation.worktree;
    try {
      if (before.kind !== "current") throw new Error("missing current-worktree rollback identity");
      const [{ stdout: head }, { stdout: branch }] = await Promise.all([
        deps.exec("git", ["rev-parse", "HEAD"], { cwd: occupiedCwd }),
        deps.exec("git", ["branch", "--show-current"], { cwd: occupiedCwd }),
      ]);
      if (head.trim() !== before.head || (branch.trim() || null) !== before.branch) {
        await deps.exec(
          "git",
          before.branch === null
            ? ["checkout", "--detach", before.head]
            : ["checkout", before.branch],
          { cwd: occupiedCwd },
        );
      }
    } catch (error) {
      failures.push({ stage: "worktree", locus: occupiedCwd, detail: errorMessage(error) });
    }
  }
  const tip = await branchTip(deps.exec, deps.cwd, transaction.occupation.branch.ref);
  if (tip !== null) {
    try {
      await deps.exec(
        "git",
        ["update-ref", "-d", transaction.occupation.branch.ref, transaction.occupation.baseHead],
        { cwd: deps.cwd },
      );
    } catch (error) {
      failures.push({
        stage: "branch",
        locus: transaction.occupation.branch.ref,
        detail: errorMessage(error),
      });
    }
  }
}

async function verifyRollback(
  transaction: ValidatedGraduationTransaction,
  deps: AtomicGraduationDependencies,
  failures: GraduationRollbackFailure[],
): Promise<void> {
  try {
    if (await branchTip(deps.exec, deps.cwd, transaction.occupation.branch.ref) !== null) {
      throw new Error("created branch remains");
    }
    if (transaction.occupation.mode === "in-place") {
      if (await indexTree(deps.exec, deps.cwd) !== transaction.occupation.indexTree) {
        throw new Error("index tree differs");
      }
      await verifyPaths(transaction, deps, deps.cwd, "source");
    } else {
      const worktree = transaction.occupation.worktree;
      if (worktree.kind !== "absent") throw new Error("spawned worktree preimage is invalid");
      const { stdout } = await deps.exec("git", ["worktree", "list", "--porcelain"], { cwd: deps.cwd });
      if (parseGitWorktreePorcelain(stdout).some(({ path }) => path === worktree.path)
        || await pathExists(deps.fs, worktree.path)) {
        throw new Error("spawned worktree remains");
      }
    }
  } catch (error) {
    failures.push({ stage: "verification", locus: transaction.slug, detail: errorMessage(error) });
  }
}

/**
 * Apply one validated start transaction, or restore and verify every captured preimage.
 *
 * @param transaction - The sole graduation authority and output-byte source
 * @param deps - Git and filesystem mechanics
 * @returns Applied, fully rolled-back rejection, or exact recovery-required residue
 */
export async function atomicGraduate(
  transaction: ValidatedGraduationTransaction,
  deps: AtomicGraduationDependencies,
): Promise<AtomicGraduationResult> {
  let occupiedCwd = deps.cwd;
  let occupationAttempted = false;
  let filesTouched = false;
  let index: GitIndexTransaction | null = null;
  let indexInstalled = false;
  let postCreateNotice: string | null = null;
  let locusReceipt: WorkUnitLocusReceipt | null = null;
  try {
    await verifyInitialOccupation(transaction, deps);
    occupationAttempted = true;
    occupiedCwd = await occupy(transaction, deps);
    const operation = transaction.occupation.operation;
    if (operation.kind === "spawned") {
      if (deps.provisionSpawnedWorktree === undefined) {
        throw new Error("spawned graduation provisioning is unavailable.");
      }
      postCreateNotice = await deps.provisionSpawnedWorktree(operation);
    }
    if (deps.workUnitLocus !== undefined) {
      locusReceipt = await deps.workUnitLocus.reconcile({
        checkoutPath: occupiedCwd,
        branch: transaction.branch,
        wuName: transaction.slug,
        attachSession: transaction.occupation.mode === "in-place",
      });
    }
    if (await indexTree(deps.exec, occupiedCwd) !== transaction.occupation.indexTree) {
      throw new Error("Occupied worktree index differs from the validated preimage.");
    }
    await verifyPaths(transaction, deps, occupiedCwd, "source");
    index = await (deps.captureIndex ?? captureGitIndexState)(deps.exec, occupiedCwd);
    if (await indexTree(deps.exec, occupiedCwd, index.indexFile) !== transaction.occupation.indexTree) {
      throw new Error("Locked graduation index differs from the validated preimage.");
    }
    filesTouched = true;
    await applyFiles(transaction, deps, occupiedCwd);
    await stageFiles(transaction, deps, occupiedCwd, index);
    await verifyPaths(transaction, deps, occupiedCwd, "target");
    await verifyIndex(transaction, deps, occupiedCwd, index.indexFile);
    await index.commit();
    indexInstalled = true;
    await verifyIndex(transaction, deps, occupiedCwd);
    return {
      status: "applied",
      worktreePath: occupiedCwd,
      postCreateNotice,
    };
  } catch (error) {
    const reason = errorMessage(error);
    if (!occupationAttempted) return { status: "rejected", reason };
    const failures: GraduationRollbackFailure[] = [];
    let rollbackAttempted = false;
    const rollback = async (): Promise<void> => {
      if (rollbackAttempted) return;
      rollbackAttempted = true;
      if (index !== null && !indexInstalled) {
        try {
          await index.rollback();
        } catch (rollbackError) {
          failures.push({ stage: "index", locus: occupiedCwd, detail: errorMessage(rollbackError) });
        }
      }
      if (indexInstalled) {
        failures.push({
          stage: "index",
          locus: occupiedCwd,
          detail: "installed index failed final parity and cannot be restored automatically",
        });
      }
      if (transaction.occupation.mode === "in-place" && filesTouched) {
        await restoreFiles(transaction, deps, occupiedCwd, failures);
      }
      await rollbackOccupation(transaction, deps, occupiedCwd, failures);
      await verifyRollback(transaction, deps, failures);
    };
    if (locusReceipt?.roleCreated === true) {
      const locusDriver = deps.workUnitLocus;
      if (locusDriver?.retire === undefined) {
        failures.push({
          stage: "locus",
          locus: occupiedCwd,
          detail: "new work-unit role cannot be retired by the configured locus driver",
        });
      } else {
        try {
          await locusDriver.retire({
            checkoutPath: occupiedCwd,
            wuName: transaction.slug,
            removeCheckout: async () => {
              const before = failures.length;
              await rollback();
              if (failures.length !== before) throw new Error("atomic graduation rollback was incomplete");
            },
          });
        } catch (rollbackError) {
          failures.push({ stage: "locus", locus: occupiedCwd, detail: errorMessage(rollbackError) });
        }
      }
    }
    await rollback();
    if (failures.length === 0) return { status: "rejected", reason };
    return {
      status: "graduation-recovery-required",
      reason,
      residue: {
        slug: transaction.slug,
        branch: transaction.branch,
        mode: transaction.occupation.mode,
        failures,
      },
    };
  }
}
