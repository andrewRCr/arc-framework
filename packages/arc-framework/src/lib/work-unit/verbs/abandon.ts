/**
 * The `abandon` verb — the destructive inverse of `stub`.
 *
 * `abandon` removes a work unit from any **pre-merge** state, leaving no residue,
 * so the resolver then returns `nonexistent`. It is a destructive cascade gated
 * on explicit confirmation (the `confirmation` guard's `--yes`); the impact-plan
 * print and the confirmation prompt are the handler's, but the refusal-without-
 * confirmation is enforced here through the guard input (never fabricated).
 *
 * The cascade is phase-polymorphic over the source state, matching the table's
 * per-cell encoding:
 *
 * - `provisional` / `planned` — a branchless backlog stub: just remove the
 *   artifact set.
 * - `planning` / `active` — remove the artifact set in-verb, record the receipt,
 *   and defer branch, worktree, and per-WU workspace cleanup until that evidence
 *   is authoritative on the protection-aware base.
 * - `parked` — remove the base-branch pointer, record the preserved branch as
 *   the unchanged retiring projection, and defer branch + workspace cleanup
 *   until that evidence is authoritative.
 *
 * `integrating` and merged / `shipped` are illegal (the table's marked cells):
 * post-merge backout is a new origin-linked WU (ADR-026 amendment), never a
 * same-unit abandon.
 *
 * The verb resolves the source state from the lifecycle index, composes the
 * matching leg operands (the branch-delete / worktree-teardown ops), registers a
 * `remove` artifact runner that deletes the WU's own artifact set by slug, and
 * dispatches through {@link executeTransition}.
 *
 * @module
 */

import { basename, join, posix } from "node:path";

import { parseMetaRecord, type ParsedMetaRecord } from "../../active/meta-reader.js";
import { patchDigest, type PatchOperation } from "../../canonical/content-digest.js";
import type { ManagedPath } from "../../canonical/managed-path.js";
import { DISCARD_RESULT, receiptId } from "../../canonical/receipt-id.js";
import { resolveArcPath } from "../../layout/index.js";
import type { ComposedLifecycleIndexResult } from "../composed-lifecycle-index.js";
import { buildLifecycleIndex } from "../lifecycle-index.js";
import {
  executeTransition,
  type ArtifactRunner,
  type ExecuteTransitionContext,
  type TransitionInputs,
  type TransitionOutcome,
} from "../lifecycle-executor.js";
import { resolveSlugState, type LifecycleState } from "../lifecycle-resolver.js";
import { artifactMatcher } from "../mutators/relocate-artifacts.js";
import {
  describeTeardownAuthorizationRefusal,
  type RetirementAuthorityPort,
  type RetirementAuthorityScope,
  type RetirementReceipt,
} from "../retirement-authority.js";
import {
  projectPendingRetirementLifecycle,
  type RetirementLifecycleResult,
} from "../retirement-lifecycle-result.js";
import { validFromStates } from "./dispatch.js";

/** Filesystem seam for the `remove` artifact disposition — list, delete files, drop the emptied subdir. */
export interface AbandonFs {
  /** List entry names directly under a directory (matches `fs.readdir(p)`). */
  readdir: (path: string) => Promise<string[]>;
  /** Remove one file (matches `fs.rm(p)`). */
  rm: (path: string) => Promise<void>;
  /** Remove an emptied directory (matches `fs.rmdir(p)`); best-effort. */
  rmdir: (path: string) => Promise<void>;
}

/**
 * The seams `runAbandon` drives — the executor's transition engine (minus the
 * `scaffoldOrRemove` runner, which the verb builds) plus the artifact-removal fs.
 */
export interface AbandonContext {
  executor: Omit<ExecuteTransitionContext, "scaffoldOrRemove">;
  fs: AbandonFs;
  retirement: AbandonRetirementContext;
  /** Remote-aware lifecycle truth; omitted only by tree-compatible library callers. */
  composed?: ComposedLifecycleIndexResult;
}

/** Source evidence captured before an abandon removes its artifact group. */
export interface AbandonSourceEvidence {
  scope: RetirementAuthorityScope;
  artifactDigest: RetirementReceipt["source"]["artifactDigest"];
  sourceArtifactPaths: readonly ManagedPath[];
  resultArtifactPaths: readonly ManagedPath[];
}

/** Retirement seams used to bind an abandon to one exact direct transition. */
export interface AbandonRetirementContext {
  authority: Pick<RetirementAuthorityPort, "readSnapshot" | "record">;
  captureSource(params: {
    name: string;
    sourceDir: string;
    expectedBranch: string | null;
    retirementSource?: {
      branch: string;
      sourceDir: string;
    };
  }): Promise<AbandonSourceEvidence>;
  stageTransition(source: AbandonSourceEvidence): Promise<void>;
  rollbackTransition(source: AbandonSourceEvidence): Promise<void>;
  readTransitionPatch(source: AbandonSourceEvidence): Promise<readonly PatchOperation[]>;
}

/** The judgment + operational inputs an `abandon` supplies. */
export interface AbandonParams {
  /** Target WU name — slug-required for safety (never default-to-current). */
  name: string;
  /** Explicit destructive-cascade confirmation (`--yes`); absent ⇒ refused. */
  confirmed: boolean | undefined;
}

/** The outcome of an `abandon` attempt — a rejection, or the completed teardown. */
export type AbandonResult =
  | { status: "rejected"; reason: string }
  | {
      status: "abandoned";
      outcome: TransitionOutcome;
      receipt: RetirementReceipt;
      authorityVersion: string;
      lifecycle: RetirementLifecycleResult;
    };

/** Started states whose branch + worktree cleanup is deferred until receipt landing. */
const STARTED: ReadonlySet<LifecycleState> = new Set(["planning", "active"]);

/** Parked state retains a branch but has no registered worktree. */
const PARKED: ReadonlySet<LifecycleState> = new Set(["parked"]);
const ACTIVE_DIR = resolveArcPath({ kind: "placement-root", tier: "active" });

/** The destructive-cascade impact preview for an `abandon` — its legality and the cascade lines. */
export interface AbandonPlan {
  /** Whether `abandon` may legally act on the resolved state (a pre-merge cell). */
  legal: boolean;
  /** The cascade lines to present before requiring confirmation (empty when illegal). */
  lines: string[];
}

/**
 * Compose the destructive-cascade impact plan for a resolved source state, gated on
 * the state's table cell: a backlog stub removes only artifacts; a started WU
 * removes artifacts in-verb and defers cleanup to a landed-evidence
 * `arc teardown <name>`; a parked WU removes its pointer while preserving the
 * branch for the same landed cleanup.
 * Pure: the handler resolves the state + branch, prints these lines, and
 * refuses without explicit confirmation.
 *
 * @param state - The target WU's resolved lifecycle state.
 * @param branch - The WU's recorded branch, deleted in-verb for a parked WU.
 * @param name - The WU slug for the landed cleanup command.
 * @returns The legality verdict and the impact-plan lines (empty when illegal).
 */
export function planAbandon(state: LifecycleState, branch: string | null, name: string): AbandonPlan {
  if (!validFromStates("abandon").includes(state)) return { legal: false, lines: [] };
  const lines = ["Artifacts: remove the work unit's artifact set"];
  if (STARTED.has(state)) {
    lines.push(`Teardown:  after landing — \`arc teardown ${name}\` (receipt-backed cleanup)`);
  } else if (PARKED.has(state)) {
    lines.push(`Teardown:  after landing — \`arc teardown ${name}\` (preserved branch \`${branch ?? "[none]"}\`)`);
  }
  lines.push(
    STARTED.has(state) || PARKED.has(state)
      ? "Workspace: close after landed cleanup"
      : "Workspace: not applicable",
  );
  lines.push("ROADMAP:   remove its row");
  return { legal: true, lines };
}

/**
 * Run `abandon`: resolve the source state, compose the per-cell operands, and
 * dispatch the destructive cascade. A started WU's branch + worktree teardown is
 * **not** fired here — it is deferred to receipt-authorized `arc teardown` after
 * landing. A parked WU's preserved branch is the unchanged retiring projection
 * while the pointer removal lands on base. Rejects without confirmation (the
 * `confirmation` guard) or from an
 * illegal source (the table's lookup — `integrating` / merged / `shipped`).
 *
 * @param ctx - The executor seams plus the artifact-removal fs.
 * @param params - The target WU and the confirmation flag.
 * @returns A rejection or the completed teardown outcome.
 */
export async function runAbandon(ctx: AbandonContext, params: AbandonParams): Promise<AbandonResult> {
  const { name, confirmed } = params;
  const { executor, fs, retirement } = ctx;

  const index = ctx.composed?.index
    ?? await buildLifecycleIndex({ cwd: executor.cwd, fs: executor.indexFs });
  const state = resolveSlugState(index, name);
  const entry = index.get(name);
  const writablePath = ctx.composed === undefined
    ? entry?.path
    : ctx.composed.recordsBySlug.get(name)?.writablePath;
  const meta = writablePath === undefined ? null : await readMeta(executor, writablePath);

  const sourceBranch = meta?.branch;
  const inputs: TransitionInputs = {
    confirmed,
    ...(sourceBranch === null || sourceBranch === undefined || sourceBranch === "[none]"
      ? {}
      : { supersededSource: { slug: name, branch: sourceBranch } }),
  };

  const scaffoldOrRemove = buildRemoveRunner(executor.cwd, fs, executor.stageMeta);
  if (
    confirmed !== true
    || entry === undefined
    || writablePath === undefined
    || !validFromStates("abandon").includes(state)
  ) {
    if (confirmed === true && entry !== undefined && writablePath === undefined) {
      return {
        status: "rejected",
        reason: `Cannot abandon \`${name}\`: composed lifecycle truth does not grant current-checkout write authority.`,
      };
    }
    const outcome = await executeTransition(
      { ...executor, scaffoldOrRemove },
      { verb: "abandon", slug: name, inputs },
    );
    if (outcome.status !== "ok") return { status: "rejected", reason: outcome.message };
    throw new Error("abandon preflight unexpectedly applied an ineligible transition");
  }

  let source: AbandonSourceEvidence;
  try {
    source = await retirement.captureSource({
      name,
      sourceDir: posix.dirname(writablePath),
      expectedBranch: STARTED.has(state)
        ? meta?.branch ?? null
        : null,
      ...(PARKED.has(state) && meta?.branch !== null && meta?.branch !== undefined
        ? { retirementSource: { branch: meta.branch, sourceDir: ACTIVE_DIR } }
        : {}),
    });
  } catch (err) {
    return {
      status: "rejected",
      reason: err instanceof Error ? err.message : "Cannot capture abandon retirement evidence.",
    };
  }
  const snapshot = await retirement.authority.readSnapshot(source.scope);
  if (snapshot.status === "refused") {
    return {
      status: "rejected",
      reason: `Cannot record abandon evidence: ${describeTeardownAuthorizationRefusal(snapshot.reason)}.`,
    };
  }
  if (snapshot.snapshot.recordState !== "absent") {
    return { status: "rejected", reason: "Cannot record abandon evidence: retirement authority already exists." };
  }

  const workspaceHandler = executor.sideEffects?.["user-workspace"];
  const transitionExecutor = {
    ...executor,
    scaffoldOrRemove,
    sideEffects: workspaceHandler === undefined
      ? executor.sideEffects
      : {
          ...executor.sideEffects,
          "user-workspace": () => Promise.resolve(undefined),
        },
  };
  const outcome = await executeTransition(transitionExecutor, { verb: "abandon", slug: name, inputs });

  if (outcome.status !== "ok") return { status: "rejected", reason: outcome.message };

  let transitionPatch: readonly PatchOperation[];
  try {
    await retirement.stageTransition(source);
    transitionPatch = await retirement.readTransitionPatch(source);
  } catch (err) {
    const rollbackFailure = await rollbackAbandon(executor, retirement, source, outcome, name);
    return {
      status: "rejected",
      reason:
        "The abandon transition was rolled back because its retirement receipt could not be prepared: "
        + `${err instanceof Error ? err.message : "retirement authority is unavailable"}.`
        + (rollbackFailure === null ? "" : ` Rollback was incomplete: ${rollbackFailure}.`),
    };
  }
  const receipt: RetirementReceipt = {
    schemaVersion: 2,
    inventoryRead: ctx.composed?.readQuality ?? "tree-only",
    receiptId: receiptId({
      schemaVersion: 2,
      subject: source.scope.subject,
      transition: "abandon",
      sourceBranch: source.scope.source.branch,
      sourceHead: source.scope.source.head,
    }),
    subject: source.scope.subject,
    transition: "abandon",
    source: {
      branch: source.scope.source.branch,
      head: source.scope.source.head,
      artifactDigest: source.artifactDigest,
    },
    transitionPatchDigest: patchDigest(transitionPatch),
    retiringProjection: PARKED.has(state) ? { kind: "unchanged" } : { kind: "direct-transition" },
    authorization: "discard-confirmed",
    result: DISCARD_RESULT,
  };
  const recorded = await retirement.authority.record(receipt, snapshot.snapshot.authorityVersion);
  if (recorded.status === "refused") {
    const rollbackFailure = await rollbackAbandon(executor, retirement, source, outcome, name);
    return {
      status: "rejected",
      reason:
        "The abandon transition was rolled back because its retirement receipt could not be recorded: "
        + `${describeTeardownAuthorizationRefusal(recorded.reason)}.`
        + (recorded.diagnostic === undefined ? "" : ` ${recorded.diagnostic}`)
        + (rollbackFailure === null ? "" : ` Rollback was incomplete: ${rollbackFailure}.`),
    };
  }
  const pendingLifecycle = projectPendingRetirementLifecycle({
    slug: name,
    branch: sourceBranch ?? null,
    transition: "abandon",
    receiptId: receipt.receiptId,
    authorityVersion: recorded.authorityVersion,
  });
  const lifecycle = !PARKED.has(state)
    ? pendingLifecycle
    : {
        ...pendingLifecycle,
        cleanup: {
          ...pendingLifecycle.cleanup,
          worktree: { status: "not-applicable" as const },
        },
      };
  return {
    status: "abandoned",
    outcome,
    receipt,
    authorityVersion: recorded.authorityVersion,
    lifecycle,
  };
}

async function rollbackAbandon(
  executor: AbandonContext["executor"],
  retirement: AbandonRetirementContext,
  source: AbandonSourceEvidence,
  outcome: Extract<TransitionOutcome, { status: "ok" }>,
  name: string,
): Promise<string | null> {
  try {
    await retirement.rollbackTransition(source);
    await executor.sideEffects?.["reconcile-status-user"]?.({
      cwd: executor.cwd,
      slug: name,
      from: outcome.to,
      to: outcome.from,
      inputs: {},
    });
    return null;
  } catch (err) {
    return err instanceof Error ? err.message : String(err);
  }
}

/** Read and parse a meta from its cwd-relative index path. */
async function readMeta(
  executor: AbandonContext["executor"],
  relPath: string,
): Promise<ParsedMetaRecord> {
  return parseMetaRecord(await executor.indexFs.readFile(join(executor.cwd, relPath)));
}

/**
 * Build the `remove` artifact runner: delete the WU's own artifact set (by slug)
 * from the source directory, then drop the directory itself when it is a per-WU
 * backlog subdir (basename === slug) — never the shared flat `active/` tier.
 */
function buildRemoveRunner(
  cwd: string,
  fs: AbandonFs,
  stagePath?: (path: string) => Promise<void>,
): ArtifactRunner {
  return async ({ disposition, slug, fromDir }) => {
    if (disposition !== "remove") {
      throw new Error(`abandon removes artifacts; received a \`${disposition}\` disposition.`);
    }
    if (fromDir === null) throw new Error("abandon-remove requires a source directory.");

    const absDir = join(cwd, fromDir);
    const matcher = artifactMatcher(slug);
    const names = (await fs.readdir(absDir)).filter((n) => matcher.test(n)).sort();
    for (const n of names) {
      await fs.rm(join(absDir, n));
      await stagePath?.(posix.join(fromDir, n));
    }

    if (basename(fromDir) === slug) {
      try {
        await fs.rmdir(absDir);
      } catch {
        // Best-effort: a still-populated or already-gone subdir is not fatal — the
        // authoritative removal is the artifact deletion above.
      }
    }
  };
}
