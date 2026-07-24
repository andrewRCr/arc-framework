/** Production command adapter for the work-unit rename verb. */

import { mkdir, readFile, readdir, rmdir, writeFile } from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";

import { parseMetaRecord } from "../lib/active/meta-reader.js";
import type { UserIOContext } from "./user.js";
import { runUserRenameWorkspace } from "./user.js";
import { listArcFiles } from "../lib/fs.js";
import { boundedGitInvocation, getCurrentBranch } from "../lib/git/exec.js";
import { DEFAULT_NETWORK_TIMEOUT_MS } from "../lib/git/remote-ref-reader.js";
import {
  renameWorktreeOwnershipMarker,
  type WorktreeSubject,
} from "../lib/git/worktree-marker.js";
import {
  resolvePrimaryWorktreePath,
  resolveWorktreePathsByBranch,
} from "../lib/git/worktree-roster.js";
import { renderTrackedProjectReadinessViewResult } from "../lib/status/project-roadmap-render.js";
import {
  resolveComposedLifecycleIndex,
} from "../lib/work-unit/composed-lifecycle-index.js";
import type { RenameRetirementContext } from "../lib/work-unit/direct-retirement-driver.js";
import type { LifecycleIndexFs, LifecycleIndexEntry } from "../lib/work-unit/lifecycle-index.js";
import {
  reconcileWorktree,
  nodeReconcileWorktreeFs,
  resolveRenameWorktreeMove,
} from "../lib/work-unit/mutators/reconcile-worktree.js";
import { renameArtifacts } from "../lib/work-unit/mutators/rename-artifacts.js";
import { rewriteRenamedMeta } from "../lib/work-unit/mutators/rewrite-renamed-meta.js";
import {
  readRemoteBranchOid,
  reconcileRenameLocalBranch,
  reconcileRenameRemoteBranch,
  withRenameStubBranch,
} from "../lib/work-unit/rename-identity.js";
import {
  applyRenameReferencePlan,
  planRenameReferences,
  type RenameReferencePlan,
  type RenameReferenceSweepContext,
} from "../lib/work-unit/rename-reference-sweep.js";
import {
  assertRenameCollisionFree,
  assertRenameExecutionLocus,
  assertRenameSubjectPreconditions,
  resolveRenameSubject,
  validateRenameRequest,
} from "../lib/work-unit/rename-preflight.js";
import {
  runRename,
  type RenamePlan,
  type RenameSubjectShape,
  type RunRenameContext,
  type RunRenameResult,
} from "../lib/work-unit/verbs/rename.js";

/** Production dependencies resolved by the CLI handler. */
export interface RenameCommandContext {
  cwd: string;
  identity: string;
  baseBranch: string;
  io: UserIOContext;
  retirement: RenameRetirementContext;
}

/** Execute one explicit old-to-new work-unit rename. */
export async function runRenameCommand(
  command: RenameCommandContext,
  params: { sourceSlug: string; targetSlug: string },
): Promise<RunRenameResult> {
  let referencePlan: RenameReferencePlan | null = null;
  const lifecycleFs = nodeLifecycleFs();
  const referenceFs = nodeReferenceFs(command.cwd);
  const exec = command.io.exec;
  const ctx: RunRenameContext = {
    retirement: command.retirement,
    preflight: async (request) => {
      const names = validateRenameRequest(request.sourceSlug, request.targetSlug);
      const fetched = await boundedGitInvocation(
        exec,
        ["fetch", "--prune", "origin", "+refs/heads/*:refs/remotes/origin/*"],
        DEFAULT_NETWORK_TIMEOUT_MS,
      );
      if (fetched.outcome !== "ok") {
        throw new Error("cannot refresh remote work-unit truth before rename");
      }
      const currentBranch = await getCurrentBranch(exec);
      const composed = await resolveComposedLifecycleIndex({
        cwd: command.cwd,
        fs: lifecycleFs,
        oracle: {
          exec,
          baseBranch: command.baseBranch,
          localOnly: false,
          expandLiveOnly: true,
        },
        ...(currentBranch === null ? {} : { prospective: { currentBranch } }),
      });
      const subject = resolveRenameSubject(composed.index, names.oldSlug, names.newSlug);
      assertRenameCollisionFree(composed, {
        resolvedSlug: subject.resolvedSlug,
        targetSlug: names.newSlug,
      });

      const metaPath = resolve(command.cwd, subject.entry.path);
      const meta = parseMetaRecord(await readFile(metaPath, "utf8"));
      const branch = normalizedBranch(meta.branch);
      const shape = await resolveSubjectShape(command, subject.entry, branch, subject.resolvedSlug, composed);
      const dirty = (await exec("git", ["status", "--porcelain"], { cwd: command.cwd })).stdout.trim() !== "";
      assertRenameSubjectPreconditions({
        subject: { kind: "work-unit", name: subject.resolvedSlug } satisfies WorktreeSubject,
        entry: subject.entry,
        dirty,
        prUrl: meta.prUrl ?? undefined,
      });

      const branches = branchPair(branch, names.oldSlug, names.newSlug, subject.resuming, shape);
      const oldRemoteOid = branches.oldBranch === null
        ? null
        : await readRemoteBranchOid(exec, "origin", branches.oldBranch);
      const dirs = renameDirectories(subject.entry, names.oldSlug, names.newSlug, subject.resuming);
      if (!subject.resuming) {
        const cohortDocRelativePath = await cohortDocumentPath(command.cwd, subject.entry, lifecycleFs);
        referencePlan = await planRenameReferences({
          arcRoot: ".arc",
          sourceSlug: names.oldSlug,
          targetSlug: names.newSlug,
          ...(cohortDocRelativePath === null ? {} : { cohortDocRelativePath }),
        }, referenceFs);
      }
      const additionalPaths = referencePlan?.changedPaths.filter(
        (path) => !isSourceArtifactPath(path, dirs.sourceDir, names.oldSlug),
      ) ?? [];
      return {
        shape,
        sourceSlug: names.oldSlug,
        targetSlug: names.newSlug,
        resolvedSlug: subject.resolvedSlug,
        resuming: subject.resuming,
        sourceDir: dirs.sourceDir,
        resultDir: dirs.resultDir,
        expectedBranch: branches.oldBranch,
        oldBranch: branches.oldBranch,
        newBranch: branches.newBranch,
        oldRemoteOid,
        additionalPaths,
        worktreePath: composed.worktreePathBySlug.get(subject.resolvedSlug) ?? null,
        baseBranch: command.baseBranch,
      };
    },
    mutateTracked: async (plan) => {
      if (referencePlan !== null) await applyRenameReferencePlan(referencePlan, referenceFs);
      await renameArtifacts({
        exec,
        fs: {
          readdir: (path) => readdir(resolve(command.cwd, path)),
          mkdir: (path, options) => mkdir(resolve(command.cwd, path), options),
          rmdir: (path) => rmdir(resolve(command.cwd, path)),
        },
      }, {
        sourceSlug: plan.sourceSlug,
        targetSlug: plan.targetSlug,
        fromDir: plan.sourceDir,
        toDir: plan.resultDir,
      });
      const resultMeta = join(plan.resultDir, `meta-${plan.targetSlug}.md`);
      const absoluteMeta = resolve(command.cwd, resultMeta);
      await writeFile(
        absoluteMeta,
        rewriteRenamedMeta(await readFile(absoluteMeta, "utf8"), plan.sourceSlug, plan.targetSlug),
        "utf8",
      );
      await regenerateRoadmap(command, lifecycleFs);
    },
    commitTracked: async (plan) => {
      await exec("git", [
        "commit",
        "-m",
        renameCommitSubject(plan.sourceSlug, plan.targetSlug),
        "-m",
        `Context: meta-${plan.sourceSlug}.md (maintenance)`,
      ], { cwd: command.cwd });
    },
    withStubBranch: async (plan, operation) => (
      await withRenameStubBranch({ exec }, {
        baseBranch: plan.baseBranch,
        oldSlug: plan.sourceSlug,
        newSlug: plan.targetSlug,
      }, async () => operation())
    ).value,
    renameLocalBranch: async (plan) => {
      if (plan.oldBranch === null || plan.newBranch === null) return;
      await reconcileRenameLocalBranch({ exec }, {
        oldBranch: plan.oldBranch,
        newBranch: plan.newBranch,
      });
    },
    renameUserWorkspace: async (plan) => {
      await runUserRenameWorkspace({
        cwd: command.cwd,
        io: command.io,
        identity: command.identity,
        currentWuName: plan.targetSlug,
        oldWuName: plan.sourceSlug,
        newWuName: plan.targetSlug,
      });
    },
    renameRemoteBranch: async (plan) => {
      if (plan.oldBranch === null || plan.newBranch === null) return { status: "unpublished" };
      return reconcileRenameRemoteBranch({ exec }, {
        remote: "origin",
        oldBranch: plan.oldBranch,
        newBranch: plan.newBranch,
        oldRemoteOid: plan.oldRemoteOid,
      });
    },
    renameMarker: async (plan) => {
      if (plan.worktreePath === null) return "absent";
      return (await renameWorktreeOwnershipMarker(plan.worktreePath, {
        oldWuName: plan.sourceSlug,
        newWuName: plan.targetSlug,
      })).status;
    },
    resolveWorktreeMove: async (plan) => {
      if (plan.newBranch === null) return { status: "in-place" };
      return resolveRenameWorktreeMove(exec, {
        branch: plan.newBranch,
        oldSlug: plan.sourceSlug,
        newSlug: plan.targetSlug,
      });
    },
    moveWorktree: (_plan, move) => reconcileWorktree({
      exec,
      chdir: (path) => {
        process.chdir(path);
      },
      fs: nodeReconcileWorktreeFs,
    }, {
      mutation: "move",
      from: move.from,
      to: move.to,
      currentLocus: command.cwd,
    }),
  };
  return runRename(ctx, params);
}

function nodeLifecycleFs(): LifecycleIndexFs {
  return {
    readdir: (path) => readdir(path, { withFileTypes: true }),
    readFile: (path) => readFile(path, "utf8"),
  };
}

function nodeReferenceFs(cwd: string): RenameReferenceSweepContext {
  return {
    listFiles: (root) => listArcFiles(resolve(cwd, root)),
    readFile: (path) => readFile(resolve(cwd, path), "utf8"),
    writeFile: (path, content) => writeFile(resolve(cwd, path), content, "utf8"),
  };
}

async function resolveSubjectShape(
  command: RenameCommandContext,
  entry: LifecycleIndexEntry,
  branch: string | null,
  resolvedSlug: string,
  composed: Awaited<ReturnType<typeof resolveComposedLifecycleIndex>>,
): Promise<RenameSubjectShape> {
  if (entry.location === "planned" || entry.location === "provisional") return "stub";
  if (branch === null) throw new Error(`work unit ${resolvedSlug} has no branch identity`);
  const byBranch = await resolveWorktreePathsByBranch(command.io.exec);
  const holding = composed.worktreePathBySlug.get(resolvedSlug) ?? byBranch.get(branch);
  if (holding === undefined) throw new Error(`cannot resolve the checkout holding ${branch}`);
  await assertRenameExecutionLocus({ currentLocus: command.cwd, holdingWorktreePath: holding });
  const primary = await resolvePrimaryWorktreePath(command.io.exec);
  return primary === holding ? "in-place" : "spawned";
}

function normalizedBranch(value: string | null): string | null {
  if (value === null || value.trim() === "" || value === "[none]") return null;
  return value.trim();
}

function branchPair(
  branch: string | null,
  oldSlug: string,
  newSlug: string,
  resuming: boolean,
  shape: RenameSubjectShape,
): Pick<RenamePlan, "oldBranch" | "newBranch"> {
  if (shape === "stub") return { oldBranch: null, newBranch: null };
  if (branch === null) throw new Error("started work-unit rename requires a branch");
  const expectedSuffix = `/${resuming ? newSlug : oldSlug}`;
  if (!branch.endsWith(expectedSuffix)) {
    throw new Error(`work-unit branch does not end with ${expectedSuffix}: ${branch}`);
  }
  const prefix = branch.slice(0, -expectedSuffix.length);
  return { oldBranch: `${prefix}/${oldSlug}`, newBranch: `${prefix}/${newSlug}` };
}

function renameDirectories(
  entry: LifecycleIndexEntry,
  oldSlug: string,
  newSlug: string,
  resuming: boolean,
): { sourceDir: string; resultDir: string } {
  const currentDir = dirname(entry.path).replaceAll("\\", "/");
  if (entry.location === "active") return { sourceDir: currentDir, resultDir: currentDir };
  const currentSlug = resuming ? newSlug : oldSlug;
  if (basename(currentDir) !== currentSlug) {
    throw new Error(`backlog work-unit directory does not match its slug: ${currentDir}`);
  }
  const parent = dirname(currentDir).replaceAll("\\", "/");
  return {
    sourceDir: `${parent}/${oldSlug}`,
    resultDir: `${parent}/${newSlug}`,
  };
}

async function cohortDocumentPath(
  cwd: string,
  entry: LifecycleIndexEntry,
  fs: LifecycleIndexFs,
): Promise<string | null> {
  if (entry.cohort === null) return null;
  const leaf = entry.cohort.split("/").at(-1);
  if (leaf === undefined) return null;
  const relative = `.arc/backlog/planned/${entry.cohort}/cohort-${leaf}.md`;
  try {
    await fs.readFile(resolve(cwd, relative));
    return relative.slice(".arc/".length);
  } catch {
    return null;
  }
}

function isSourceArtifactPath(path: string, sourceDir: string, sourceSlug: string): boolean {
  return dirname(path).replaceAll("\\", "/") === sourceDir
    && new RegExp(`^[a-z]+-${escapeRegExp(sourceSlug)}\\.md$`, "u").test(basename(path))
    && basename(path) !== `cohort-${sourceSlug}.md`;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}

async function regenerateRoadmap(command: RenameCommandContext, fs: LifecycleIndexFs): Promise<void> {
  const currentBranch = await getCurrentBranch(command.io.exec);
  const view = await renderTrackedProjectReadinessViewResult({
    cwd: command.cwd,
    exec: command.io.exec,
    fs,
    baseBranch: command.baseBranch,
    currentBranch,
  });
  const path = resolve(command.cwd, ".arc/backlog/ROADMAP.md");
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, view.markdown.endsWith("\n") ? view.markdown : `${view.markdown}\n`, "utf8");
}

function renameCommitSubject(sourceSlug: string, targetSlug: string): string {
  const descriptive = `chore(work-unit): rename ${sourceSlug} to ${targetSlug}`;
  return descriptive.length <= 72 ? descriptive : "chore(work-unit): rename work unit identity";
}
