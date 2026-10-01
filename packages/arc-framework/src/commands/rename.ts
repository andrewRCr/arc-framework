/** Production command adapter for the work-unit rename verb. */

import { mkdir, readFile, readdir, rmdir, writeFile } from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";

import { parseMetaRecord } from "../lib/active/meta-reader.js";
import { expandActiveInFlight } from "./active.js";
import { canonicalDigest } from "../lib/kernel/canonical/canonical-json.js";
import type { UserIOContext } from "./user.js";
import { runUserRenameWorkspace } from "./user.js";
import { listArcFiles } from "../lib/fs.js";
import { getCurrentBranch, type GitExec } from "../lib/git/exec.js";
import type { WorktreeSubject } from "../lib/git/worktree-marker.js";
import {
  resolvePrimaryWorktreePath,
  resolveWorktreePathsByBranch,
  scanRegisteredWorktrees,
} from "../lib/git/worktree-roster.js";
import { renderRoadmapFromIndexViewResult } from "../lib/status/roadmap-regeneration-assert.js";
import {
  resolveComposedLifecycleIndex,
} from "../lib/work-unit/composed-lifecycle-index.js";
import type { RenameRetirementContext } from "../lib/work-unit/direct-retirement-driver.js";
import type { TerminalTransitionRecordWriter } from "../lib/work-unit/terminal-transition-record-writer.js";
import type { LifecycleIndexFs, LifecycleIndexEntry } from "../lib/work-unit/lifecycle-index.js";
import {
  reconcileWorkUnitWorktree,
  nodeReconcileWorkUnitWorktreeFs,
  resolveRenameWorktreeMove,
  type ReconcileWorkUnitWorktreeResult,
  type RenameWorktreeMoveResolution,
} from "../lib/work-unit/mutators/reconcile-work-unit-worktree.js";
import {
  createNodeRenameWorktreeTransactionDriver,
} from "../lib/work-unit/rename-worktree-transaction.js";
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
  findIntegratingDependentAdvisories,
  transformDependentMutationExclusions,
} from "../lib/work-unit/transform-coordination.js";
import {
  createProspectiveTransitionOverlay,
  transitionOverlayCompositionInput,
} from "../lib/work-unit/transition-overlay.js";
import {
  runRename,
  type RenamePlan,
  type RenameSubjectShape,
  type RunRenameContext,
  type RunRenameResult,
} from "../lib/work-unit/verbs/rename.js";
import { reconcileRoadmap } from "../lib/work-unit/side-effects/readiness-regen.js";
import { readCandidateRecord } from "../lib/work-unit/candidate-record-store.js";
import { readSubmissionBoundary } from "../lib/work-unit/submission-boundary-store.js";

/** Production dependencies resolved by the CLI handler. */
export interface RenameCommandContext {
  cwd: string;
  identity: string;
  baseBranch: string;
  io: UserIOContext & { execInput: NonNullable<UserIOContext["execInput"]> };
  retirement: RenameRetirementContext;
  transitionWriter: TerminalTransitionRecordWriter;
  onPreparedAdvisories?(advisories: readonly string[]): Promise<void>;
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
    transitionWriter: command.transitionWriter,
    onPrepared: async (plan) => {
      if (!plan.resuming) {
        const [candidate, boundary] = await Promise.all([
          readCandidateRecord(command.cwd, plan.sourceSlug),
          readSubmissionBoundary(command.cwd, plan.sourceSlug),
        ]);
        if (candidate !== null || boundary !== null) {
          throw new Error("A work unit with Candidate publication state cannot be renamed.");
        }
      }
      await command.onPreparedAdvisories?.(plan.coordinationAdvisories);
    },
    preflight: async (request) => {
      const names = validateRenameRequest(request.sourceSlug, request.targetSlug);
      const currentBranch = await getCurrentBranch(exec);
      const expandedInFlight = await expandActiveInFlight({
        exec,
        execInput: command.io.execInput,
        cwd: command.cwd,
        identity: command.identity,
        teamMode: false,
        baseBranch: command.baseBranch,
      });
      if (expandedInFlight.candidateExpansion.status !== "complete") {
        throw new Error("Could not completely expand remote work-unit candidates.");
      }
      const composed = await resolveComposedLifecycleIndex({
        cwd: command.cwd,
        fs: lifecycleFs,
        oracle: {
          exec,
          baseBranch: command.baseBranch,
          acquisitionPolicy: "materialized-live",
          suppliedResult: expandedInFlight,
        },
        ...(currentBranch === null ? {} : { prospective: { currentBranch } }),
      });
      const subject = resolveRenameSubject(composed.index, names.oldSlug, names.newSlug);
      assertRenameCollisionFree(composed, {
        resolvedSlug: subject.resolvedSlug,
        targetSlug: names.newSlug,
      });
      const writablePath = composed.recordsBySlug.get(subject.resolvedSlug)?.writablePath;
      if (writablePath === undefined) {
        throw new Error(`cannot rename ${subject.resolvedSlug} without current-checkout write authority`);
      }
      const writableSubject = { ...subject, entry: { ...subject.entry, path: writablePath } };

      const metaPath = resolve(command.cwd, writableSubject.entry.path);
      const meta = parseMetaRecord(await readFile(metaPath, "utf8"));
      const branch = normalizedBranch(meta.branch);
      const shape = await resolveSubjectShape(
        command,
        writableSubject.entry,
        branch,
        writableSubject.resolvedSlug,
        composed,
      );
      const dirty = (await exec("git", ["status", "--porcelain"], { cwd: command.cwd })).stdout.trim() !== "";
      assertRenameSubjectPreconditions({
        subject: { kind: "work-unit", name: subject.resolvedSlug } satisfies WorktreeSubject,
        entry: writableSubject.entry,
        dirty,
        prUrl: meta.prUrl ?? undefined,
      });

      const branches = branchPair(branch, names.oldSlug, names.newSlug, subject.resuming, shape);
      const oldRemoteOid = branches.oldBranch === null
        ? null
        : await readRemoteBranchOid(exec, "origin", branches.oldBranch);
      const dirs = renameDirectories(writableSubject.entry, names.oldSlug, names.newSlug, writableSubject.resuming);
      const coordination = findIntegratingDependentAdvisories(composed, names.oldSlug);
      if (!writableSubject.resuming) {
        const cohortDocRelativePath = await cohortDocumentPath(command.cwd, writableSubject.entry, lifecycleFs);
        referencePlan = await planRenameReferences({
          arcRoot: ".arc",
          sourceSlug: names.oldSlug,
          targetSlug: names.newSlug,
          ...(cohortDocRelativePath === null ? {} : { cohortDocRelativePath }),
          excludedPaths: transformDependentMutationExclusions(composed, names.oldSlug, command.cwd),
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
        coordinationAdvisories: coordination.map((advisory) => advisory.text),
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
    },
    regenerateReadiness: async (plan) => await reconcileRoadmap(
      {
        composeView: async () => {
          const currentBranch = await getCurrentBranch(command.io.exec);
          const { result } = await renderRoadmapFromIndexViewResult({
            cwd: command.cwd,
            exec: command.io.exec,
            baseBranch: command.baseBranch,
            currentBranch,
            ...(plan.oldBranch === null
              ? {}
              : {
                  transitionOverlays: [
                    transitionOverlayCompositionInput(createProspectiveTransitionOverlay({
                      origin: plan.sourceSlug,
                      sourceBranch: plan.oldBranch,
                      planId: canonicalDigest({
                        kind: "rename",
                        origin: plan.sourceSlug,
                        sourceBranch: plan.oldBranch,
                        target: plan.targetSlug,
                      }),
                    })),
                  ],
                }),
          });
          return {
            content: result.markdown,
            advisories: result.warnings.map((warning) => warning.rendered),
          };
        },
        mkdir: command.io.mkdir,
        writeFile: command.io.writeFile,
        stageFile: async (path) => {
          await command.io.exec("git", ["add", path], { cwd: command.cwd });
        },
      },
      {
        cwd: command.cwd,
        slug: plan.sourceSlug,
        from: null,
        to: null,
      },
    ),
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
    resolveWorktreeMove: async (plan) => {
      if (plan.newBranch === null) return { status: "in-place" };
      return resolveRenameWorktreeMove(exec, {
        branch: plan.newBranch,
        oldSlug: plan.sourceSlug,
        newSlug: plan.targetSlug,
        currentLocus: command.cwd,
      });
    },
    renameCheckout: async (plan, move) => {
      const checkout = await resolveRenameCheckoutCoordinates(exec, move);
      if (checkout === null) throw new Error("could not resolve the checkout rename coordinates");
      let worktree: ReconcileWorkUnitWorktreeResult | undefined;
      if (move.status === "deferred-self-move" && plan.newBranch === null) {
        throw new Error("deferred spawned rename is missing its renamed branch");
      }
      const renameMovePending = move.status === "deferred-self-move" && plan.newBranch !== null
        ? {
            oldSlug: plan.sourceSlug,
            newSlug: plan.targetSlug,
            branch: plan.newBranch,
            head: checkout.expectedHead,
            from: move.from,
            to: move.to,
          }
        : null;
      const checkoutOutcome = await createNodeRenameWorktreeTransactionDriver({ exec }).rename({
        sourceCheckoutPath: checkout.from,
        targetCheckoutPath: checkout.to,
        sourceSlug: plan.sourceSlug,
        targetSlug: plan.targetSlug,
        expectedHead: checkout.expectedHead,
        renameMovePending,
        ...(move.status === "move"
          ? {
              move: {
                apply: async () => {
                  worktree = await reconcileWorkUnitWorktree({
                    exec,
                    chdir: (path) => {
                      process.chdir(path);
                    },
                    fs: nodeReconcileWorkUnitWorktreeFs,
                  }, {
                    mutation: "move",
                    from: move.from,
                    to: move.to,
                    currentLocus: command.cwd,
                  });
                },
                rollback: async () => {
                  await reconcileWorkUnitWorktree({
                    exec,
                    chdir: (path) => {
                      process.chdir(path);
                    },
                    fs: nodeReconcileWorkUnitWorktreeFs,
                  }, {
                    mutation: "move",
                    from: move.to,
                    to: move.from,
                    currentLocus: command.cwd,
                  });
                  },
              },
            }
          : {}),
      });
      return { checkout: checkoutOutcome, ...(worktree === undefined ? {} : { worktree }) };
    },
  };
  return runRename(ctx, params);
}

/**
 * Resolve the checkout coordinates the marker/topology rename runs against.
 *
 * A pending move spans its source and destination; every other resolution keeps one path
 * and renames the subject alone. `in-place` names the primary checkout, which the roster reports
 * under the renamed branch rather than a slug-derived path. Returns `null` when no registered
 * checkout backs the subject.
 */
export async function resolveRenameCheckoutCoordinates(
  exec: GitExec,
  move: RenameWorktreeMoveResolution,
): Promise<{ from: string; to: string; expectedHead: string } | null> {
  const from = move.status === "move" || move.status === "deferred-self-move"
    ? move.from
    : move.status === "in-place"
      ? await resolvePrimaryWorktreePath(exec)
      : move.status === "already-moved"
        // The transaction needs both coordinates to prove that a landed move removed the source
        // registration and established the destination registration.
        ? move.sourceWorktreePath
        : move.worktreePath;
  if (from === null) return null;
  const to = move.status === "move"
    ? move.to
    : move.status === "already-moved" ? move.worktreePath : from;
  const roster = await scanRegisteredWorktrees(exec);
  if (!roster.ok) throw new Error(`could not read the registered worktrees: ${roster.message}`);
  // A landed move already reports the destination; a pending one still reports its source.
  const expected = roster.worktrees.find((entry) => resolve(entry.path) === resolve(to))
    ?? roster.worktrees.find((entry) => resolve(entry.path) === resolve(from));
  if (expected === undefined) return null;
  return { from, to, expectedHead: expected.head };
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

function renameCommitSubject(sourceSlug: string, targetSlug: string): string {
  const descriptive = `chore(work-unit): rename ${sourceSlug} to ${targetSlug}`;
  return descriptive.length <= 72 ? descriptive : "chore(work-unit): rename work unit identity";
}
