/**
 * The `teardown` verb — physical cleanup (branch + worktree) of a retired work
 * unit, in two modes (see {@link TeardownMode}).
 *
 * The deterministic cleanup hand-run today in the integration tail: reap the
 * branch (locally, and the live remote head once the landed-in-base proof
 * holds), remove the worktree (worktree-kind dispatched, presence-guarded), and
 * prune the stale remote-tracking ref. It composes the shared legs — a
 * `reconcile-branch` delete, the remote-head delete, the `reconcile-worktree`
 * teardown, and the `fetch-prune` leg — never re-implementing their mechanics.
 *
 * Teardown is **not** a lifecycle transition: the branch and worktree are
 * *projections*, not lifecycle state, so it does not run through the transition
 * table. It fires *after* the retiring transition has merged, distinct from the
 * pre-merge `archive` sweep.
 *
 * Two modes share every mechanic but the gate and the branch-delete strategy:
 *
 * - **`shipped`** (default) — post-merge cleanup of a `completed/` WU. The
 *   two-part safety model (settled upstream): (1) **arc-state authority** — the
 *   WU resides in `completed/` (the `archive` transition ran), resolved from
 *   location via {@link isShipped}, never from `git branch` / `git log`
 *   inference; (2) **preservation durability** — every local commit is provably
 *   preserved (contained in its upstream, or landed in `base` by
 *   patch-equivalence), enacted by the shared reap oracle ({@link
 *   assessReapSafety}) the merged-safe delete leg uses, holding even when the
 *   remote-tracking ref was pruned at merge. The base leg checks against the
 *   freshly-fetched `origin/<base>` (see {@link refreshBase}), so a stale local
 *   base — the common state right after a remote merge — never false-negatives a
 *   merged branch; teardown is order-independent of any prior fetch / prune.
 * - **`abandoned`** — cleanup of a *retired* / *parked* origin (a decompose
 *   origin removed into its members, a `park@Planning` shelf) whose branch is
 *   *unmerged by construction*. The gate is the inverse (any un-shipped WU; a
 *   `completed/` one is refused), and the branch is force-deleted (local +
 *   remote). Git-containment cannot prove safety for an unmerged branch, so the
 *   safety is the *caller's* conservation gate — passing this mode is that
 *   authorization.
 *
 * The branch name is resolved by enumerating local refs and matching the WU slug
 * ({@link branchToWorkUnitSlug}) — a ref-projection lookup, type-prefix agnostic,
 * because the meta `Branch` field is cleared to `[none]` at archive. The legs fire
 * in the only constraint-safe order: free the checked-out branch first — a linked
 * worktree is torn down, an in-place branch is relocated by switching the primary
 * worktree to `base` — then the branch delete, then the prune.
 *
 * @module
 */

import { assessReapSafety, isLandedInBase } from "../../git/branch-containment.js";
import type { GitExec } from "../../git/exec.js";
import { refreshBase } from "../../git/refresh-base.js";
import { decideHuskCleanup, isWorktreeClean } from "../../git/worktree-cleanup.js";
import {
  readWorktreeMarker,
  stampWorktreeHusk,
  type WorktreeHuskStampResult,
  type WorktreeMarkerReadResult,
  type WorktreeSubject,
} from "../../git/worktree-marker.js";
import {
  scanRegisteredWorktrees,
  type RegisteredWorktreeScanResult,
} from "../../git/worktree-roster.js";
import { reconcileLinkedIdentityGlobalUserSurfaces } from "../../user-surface-migration.js";
import { branchToWorkUnitSlug } from "../completed-index.js";
import { buildLifecycleIndex, type LifecycleIndexFs } from "../lifecycle-index.js";
import { isShipped } from "../lifecycle-resolver.js";
import { fetchPrune } from "../mutators/fetch-prune.js";
import { deleteRemoteBranch, reconcileBranch } from "../mutators/reconcile-branch.js";
import {
  nodeReconcileWorktreeFs,
  reconcileWorktree,
  isSelfTeardown,
  type ReconcileWorktreeFs,
} from "../mutators/reconcile-worktree.js";
import { isSlugSafe } from "../slug.js";

/** The seams `runTeardown` drives — the git executor (pinned to cwd), the index scan, and the locus-hop. */
export interface TeardownContext {
  /** Repository root containing `.arc/`. */
  cwd: string;
  /** Git executor, pinned to the repository root. */
  exec: GitExec;
  /** Lifecycle-index scan seam — backs the arc-state authority gate. */
  indexFs: LifecycleIndexFs;
  /** Relocate the process locus on a self-teardown (production binds `process.chdir`). */
  chdir: (dir: string) => void;
  /** Registered-worktree inventory seam. */
  scanWorktrees?: (exec: GitExec) => Promise<RegisteredWorktreeScanResult>;
  /** Marker read seam for detached-husk discovery. */
  readMarker?: (worktreePath: string) => Promise<WorktreeMarkerReadResult>;
  /** Non-minting marker extension seam. */
  stampHusk?: (worktreePath: string, stamp: Parameters<typeof stampWorktreeHusk>[1]) => Promise<WorktreeHuskStampResult>;
  /** Worktree/user-surface filesystem seam. */
  worktreeFs?: ReconcileWorktreeFs;
  /** Wall-clock seam for terminal stamps. */
  now?: () => number;
}

/**
 * Teardown mode — selects the arc-state gate and the branch-delete strategy. The
 * worktree / locus-hop / ordering / prune mechanics are identical in both.
 *
 * - `shipped` (default) — a `completed/` WU whose branch is merged. Gate:
 *   `completed/` presence ({@link isShipped}). Branch delete: the merged-safe,
 *   containment-gated `delete-merged` — git-containment is the safety — plus a
 *   best-effort live-remote-head delete once the landed-in-base proof holds (a
 *   plain merge leaves the head to linger; delete-on-merge hosts already
 *   removed it, the idempotent no-op).
 * - `abandoned` — a *retired* / *parked* origin (decompose's removed origin, a
 *   `park@Planning` shelf) whose branch is **unmerged by construction**. Gate: the
 *   inverse — anything *not* shipped (a `completed/` WU must use the merged-safe
 *   path). Branch delete: a caller-authorized force delete (local + remote). The
 *   conservation gate the caller enforced is the upstream safety here, not
 *   git-containment; passing this mode *is* that authorization.
 */
export type TeardownMode = "shipped" | "abandoned";

/** The operational inputs a `teardown` supplies. */
export interface TeardownParams {
  /** Target WU name (the CLI defaults this to the current worktree's WU). */
  name: string;
  /** Base branch — the merged-into target the reap oracle checks, and the relocation target for an in-place branch. */
  base: string;
  /** Remote whose ref the containment check reads and the prune cleans (default `origin`). */
  remote?: string;
  /** Teardown mode (default `shipped`). See {@link TeardownMode}. */
  mode?: TeardownMode;
  /** Ephemeral next-step suggestion to surface (advisory; never persisted). */
  suggestion?: string;
}

/** Inputs for reaping a recordless cheap branch by exact branch name. */
export interface BranchTeardownParams {
  /** Exact branch name to reap. Only `chore/<slug>` cheap branches are accepted. */
  branch: string;
  /** Base branch — the merged-into target the reap oracle checks, and the relocation target for an in-place branch. */
  base: string;
  /** Remote whose ref the containment check reads and the prune cleans (default `origin`). */
  remote?: string;
  /** Ephemeral next-step suggestion to surface (advisory; never persisted). */
  suggestion?: string;
}

/** The outcome of a `teardown` attempt — a rejection, or the completed cleanup. */
export type TeardownResult =
  | {
      status: "rejected";
      reason: string;
      huskRefusal?: "dirty" | "preservation-unproven" | "user-surfaces";
    }
  | {
      status: "torn-down";
      /** The reaped WU branch, or `null` when no local branch remained (already reaped). */
      branch: string | null;
      /** Whether the merged-safe delete removed the branch (false when the push-state gate refused it). */
      branchDeleted: boolean;
      /**
       * Whether the live remote head was deleted too — the shipped-mode leg gated
       * on the landed-in-base proof. False when the head was already gone
       * (delete-on-merge), was left as the sole proven preservation, or the
       * abandoned force path handled the remote inside its own delete leg.
       */
      remoteBranchDeleted: boolean;
      /** The removed worktree path, or `null` for the in-place / already-absent arm. */
      worktreeRemoved: string | null;
      /** Terminal detached-worktree transition, when physical self-removal was deferred. */
      husk: {
        worktreePath: string;
        subject: WorktreeSubject;
        branch: string;
        stamped: boolean;
        outcome: "created" | "already-husked";
      } | null;
      /** Whether the prune leg ran cleanly. */
      pruned: boolean;
      /** Non-fatal advisories (a push-state refusal, a best-effort prune failure). */
      notices: string[];
      /** The ephemeral next-step suggestion, surfaced not persisted. */
      suggestion: string | null;
    };

const CHEAP_BRANCH_PREFIX = "chore/";

function worktreeSubjectsEqual(left: WorktreeSubject, right: WorktreeSubject): boolean {
  if (left.kind !== right.kind) return false;
  if (left.kind === "work-unit" && right.kind === "work-unit") return left.name === right.name;
  if (left.kind === "errand" && right.kind === "errand") return left.slug === right.slug;
  return left.kind === "branch" && right.kind === "branch" && left.ref === right.ref;
}

/**
 * Resolve the WU's local branch by enumerating `refs/heads` and matching the slug.
 * Type-prefix agnostic ({@link branchToWorkUnitSlug}), since the meta `Branch`
 * field is `[none]` post-archive. `null` means no local branch maps (already
 * reaped); an `error` means more than one does (ambiguous — refuse).
 */
async function resolveWuBranch(
  exec: GitExec,
  name: string,
): Promise<{ branch: string | null } | { error: string }> {
  let stdout: string;
  try {
    ({ stdout } = await exec("git", ["for-each-ref", "--format=%(refname:short)", "refs/heads"]));
  } catch (err) {
    return { error: `could not enumerate local branches (${err instanceof Error ? err.message : String(err)})` };
  }
  const matches = stdout
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line !== "")
    .filter((branch) => branchToWorkUnitSlug(branch) === name);
  const [first, ...rest] = matches;
  if (first === undefined) return { branch: null };
  if (rest.length > 0) {
    return { error: `multiple local branches map to \`${name}\`: ${matches.join(", ")} — resolve manually.` };
  }
  return { branch: first };
}

/** Whether a local branch ref exists. */
async function branchExists(exec: GitExec, branch: string): Promise<boolean> {
  try {
    await exec("git", ["show-ref", "--verify", "--quiet", `refs/heads/${branch}`]);
    return true;
  } catch {
    return false;
  }
}

async function readBranchPresence(
  exec: GitExec,
  branch: string,
): Promise<{ ok: true; present: boolean } | { ok: false; message: string }> {
  try {
    const { stdout } = await exec("git", ["for-each-ref", "--format=%(refname:short)", `refs/heads/${branch}`]);
    return { ok: true, present: stdout.split("\n").some((line) => line.trim() === branch) };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : String(err) };
  }
}

interface TeardownBranchProjectionParams {
  branch: string | null;
  subject: WorktreeSubject;
  base: string;
  remote?: string;
  mode: TeardownMode;
  suggestion?: string;
  allowHusk: boolean;
}

async function teardownBranchProjection(
  ctx: TeardownContext,
  params: TeardownBranchProjectionParams,
): Promise<TeardownResult> {
  const { cwd, exec, chdir } = ctx;
  const { branch, subject, base, remote, mode, suggestion, allowHusk } = params;
  const notices: string[] = [];
  const fs = ctx.worktreeFs ?? nodeReconcileWorktreeFs;
  const scan = await (ctx.scanWorktrees ?? scanRegisteredWorktrees)(exec);
  if (!scan.ok) {
    return { status: "rejected", reason: `Could not read registered worktrees (${scan.message}).` };
  }

  // Refresh the base before the reap-safety check and any in-place relocation. The
  // landed-in-base leg checks patch-equivalence against `base`, but right after a
  // remote merge the *local* `base` is typically stale (the merge is on
  // `origin/<base>`, not yet pulled), so checking the local ref false-negatives a
  // merged branch — the order-dependence that forced a manual fetch + retry. Fetch
  // `origin/<base>` and evaluate against that authoritative ref instead. Best-effort:
  // offline / no-remote degrades to the local ref (prior behavior). Only meaningful
  // when a branch remains to reap.
  const baseRef = branch === null ? base : await refreshBase(exec, base, remote);

  // Worktree arm: tear down a *linked* worktree (distinct from the primary). The
  // in-place arm (branch in the primary worktree) and an already-removed worktree
  // are presence-guarded no-ops. Worktree first, so the branch delete is not refused
  // for a checked-out branch.
  let worktreeRemoved: string | null = null;
  let husk: Extract<TeardownResult, { status: "torn-down" }>["husk"] = null;
  const branchedRegistration = branch === null
    ? undefined
    : scan.worktrees.find((worktree) => worktree.branch === branch);
  type DetachedCandidate = {
    path: string;
    head: string;
    marker: Extract<WorktreeMarkerReadResult, { kind: "present" }>["marker"];
  };
  const matches: DetachedCandidate[] = [];
  const mismatchedBranches: string[] = [];
  for (const worktree of scan.worktrees.filter((entry) => entry.detached)) {
    let marker: WorktreeMarkerReadResult;
    try {
      marker = await (ctx.readMarker ?? readWorktreeMarker)(worktree.path);
    } catch (err) {
      return {
        status: "rejected",
        reason: `Could not read detached worktree marker (${err instanceof Error ? err.message : String(err)}).`,
      };
    }
    if (marker.kind !== "present" || marker.marker.husk === undefined) continue;
    if (!worktreeSubjectsEqual(marker.marker.husk.subject, subject)) continue;
    if (branch !== null && marker.marker.husk.branch !== branch) {
      mismatchedBranches.push(marker.marker.husk.branch);
      continue;
    }
    matches.push({ path: worktree.path, head: worktree.head, marker: marker.marker });
  }
  if (matches.length > 1) {
    return { status: "rejected", reason: "multiple detached worktrees match the requested terminal subject" };
  }
  if (matches.length === 0 && branch !== null && mismatchedBranches.length > 0) {
    return {
      status: "rejected",
      reason:
        `detached husk subject matches the request, but its stamped branch ` +
        `(${mismatchedBranches.join(", ")}) does not match \`${branch}\``,
    };
  }
  const detachedCandidate = matches[0];

  if (detachedCandidate !== undefined) {
    const clean = await isWorktreeClean({ exec, cwd: detachedCandidate.path });
    const decision = decideHuskCleanup({
      marker: { kind: "present", marker: detachedCandidate.marker },
      clean,
      head: detachedCandidate.head,
    });
    if (decision.action !== "removable") {
      return { status: "rejected", reason: `refusing detached husk removal: ${decision.reason}` };
    }
    const stamp = detachedCandidate.marker.husk;
    if (stamp === undefined) {
      return { status: "rejected", reason: "refusing detached husk removal: missing-stamp" };
    }
    if (!isSelfTeardown(detachedCandidate.path, cwd)) {
      try {
        await reconcileWorktree(
          { exec, chdir, fs },
          {
            mutation: "teardown",
            worktreePath: detachedCandidate.path,
            currentLocus: cwd,
            huskApproved: true,
          },
        );
      } catch (err) {
        return { status: "rejected", reason: err instanceof Error ? err.message : String(err) };
      }
      worktreeRemoved = detachedCandidate.path;
    }
    husk = {
      worktreePath: detachedCandidate.path,
      subject,
      branch: stamp.branch,
      stamped: true,
      outcome: "already-husked",
    };
  } else if (branch !== null) {
    const registered = branchedRegistration;
    const primary = scan.worktrees.find((worktree) => worktree.primary)?.path;
    if (registered !== undefined && registered.path !== primary && allowHusk && isSelfTeardown(registered.path, cwd)) {
      if (!(await isWorktreeClean({ exec, cwd: registered.path }))) {
        return {
          status: "rejected",
          reason: `cannot husk a dirty worktree: ${registered.path}`,
          huskRefusal: "dirty",
        };
      }
      const safety = await assessReapSafety(exec, { branch, base: baseRef, remote });
      if (!safety.safe) {
        return { status: "rejected", reason: safety.reason, huskRefusal: "preservation-unproven" };
      }
      if (primary === undefined) {
        return { status: "rejected", reason: "cannot resolve the primary worktree before husking" };
      }
      const dryRun = await reconcileLinkedIdentityGlobalUserSurfaces({
        worktreePath: registered.path,
        primaryWorktreePath: primary,
        fs,
        dryRun: true,
        signpost: true,
      });
      if (dryRun.status === "blocked") {
        return { status: "rejected", reason: dryRun.reason, huskRefusal: "user-surfaces" };
      }
      await reconcileLinkedIdentityGlobalUserSurfaces({
        worktreePath: registered.path,
        primaryWorktreePath: primary,
        fs,
        signpost: true,
      });
      await exec("git", ["switch", "--detach"], { cwd: registered.path });
      let stamped = false;
      try {
        const stampResult = await (ctx.stampHusk ?? stampWorktreeHusk)(registered.path, {
          sha: registered.head,
          at: new Date((ctx.now ?? Date.now)()).toISOString(),
          subject,
          branch,
        });
        stamped = stampResult.kind === "stamped";
      } catch (err) {
        notices.push(`Could not stamp the detached worktree (${err instanceof Error ? err.message : String(err)}).`);
      }
      husk = { worktreePath: registered.path, subject, branch, stamped, outcome: "created" };
    } else if (registered !== undefined && registered.path !== primary) {
      try {
        await reconcileWorktree(
          { exec, chdir, fs },
          { mutation: "teardown", worktreePath: registered.path, currentLocus: cwd },
        );
      } catch (err) {
        return { status: "rejected", reason: err instanceof Error ? err.message : String(err) };
      }
      worktreeRemoved = registered.path;
    } else if (registered?.path === primary) {
      // In-place arm: the branch is checked out in the *primary* worktree, so the
      // delete would be refused ("branch used by worktree"). Relocate the primary
      // onto `base` first (a linked worktree is torn down above; an unmapped branch
      // — already switched away — needs no relocation).
      try {
        await exec("git", ["switch", base], { cwd: primary });
      } catch (err) {
        return { status: "rejected", reason: err instanceof Error ? err.message : String(err) };
      }
      // Land the developer on a current base: fast-forward local `base` to the
      // refreshed remote base (best-effort; a non-ff or unavailable base is left
      // as-is). Skipped when the remote base did not resolve (`baseRef === base`).
      if (baseRef !== base) {
        try {
          await exec("git", ["merge", "--ff-only", baseRef], { cwd: primary });
        } catch {
          // Non-fast-forwardable (local base ahead) or unavailable — leave it as-is.
        }
      }
      notices.push(`Relocated the primary worktree to \`${base}\` before reaping \`${branch}\`.`);
    }
  }

  // Branch delete — mode-keyed. `shipped`: the merged-safe, containment-gated
  // local delete, then the landed-proof-gated remote-head delete; a refusal
  // (branch ahead of / no upstream) leaves the branch
  // intact, surfaced rather than dropping work. `abandoned`: a caller-authorized
  // force delete (local + remote) — the retired origin's branch is unmerged by
  // construction, so containment would always refuse; the caller's conservation
  // gate is the safety. The local force-delete is authoritative, so a remote-ref
  // cleanup failure degrades to a notice (best-effort, like the prune leg) rather
  // than discarding the completed work.
  let branchDeleted = false;
  let remoteBranchDeleted = false;
  let localBranchDeleteFailed = false;
  if (branch !== null) {
    if (mode === "shipped") {
      // The landed-in-base proof gates the remote-head delete below. The reap
      // oracle accepts *either* preservation leg, and when only upstream
      // containment holds (e.g. a multi-commit squash, whose patch identity
      // cannot match), the remote head IS the preservation — deleting it would
      // discard the work. Computed before the local delete consumes the ref.
      const landedInBase = await isLandedInBase(exec, branch, baseRef);
      try {
        await reconcileBranch({ exec }, { mutation: "delete-merged", branch, base: baseRef, remote });
      } catch (err) {
        if (husk === null) throw err;
        localBranchDeleteFailed = true;
        const retryLocus = worktreeRemoved === null ? "from the husk or primary" : "from the primary";
        notices.push(
          `Could not delete local branch \`${branch}\` after detach ` +
            `(${err instanceof Error ? err.message : String(err)}); retry teardown ${retryLocus}.`,
        );
      }
      branchDeleted = !(await branchExists(exec, branch));
      if (!branchDeleted) {
        if (!localBranchDeleteFailed) {
          notices.push(
            `Branch \`${branch}\` is not contained on its upstream or landed in \`${baseRef}\` — left intact ` +
              `(unpushed, unmerged commits would be lost).`,
          );
        }
      } else if (landedInBase) {
        // The work provably lives in base, so a live remote head is hygiene, not
        // preservation — delete it (the platform's delete-on-merge covers this on
        // hosts configured for it; a plain merge leaves the head to linger).
        // Best-effort like the prune leg: an already-gone head is the idempotent
        // no-op, and other failures degrade to a notice rather than undoing the
        // completed local teardown.
        try {
          remoteBranchDeleted =
            (await deleteRemoteBranch(exec, remote ?? "origin", branch)) === "deleted";
        } catch (err) {
          const detail = err instanceof Error ? err.message : String(err);
          notices.push(`Could not delete the remote branch \`${branch}\` (${detail}).`);
        }
      } else {
        notices.push(
          `Remote branch \`${remote ?? "origin"}/${branch}\` left intact — it is the only proven ` +
            `preservation (contained on the upstream, not patch-landed in \`${baseRef}\`).`,
        );
      }
    } else {
      try {
        await reconcileBranch({ exec }, { mutation: "delete", branch, remote });
      } catch (err) {
        const detail = err instanceof Error ? err.message : String(err);
        // The local force-delete runs before the remote-ref cleanup, so a branch
        // that still exists means the local `git branch -D` is what failed — a
        // force-mode failure, not a best-effort remote miss. Reject rather than
        // reporting a torn-down branch that is in fact still present. A remote-only
        // failure (local delete landed) degrades to a notice, like the prune leg.
        if (await branchExists(exec, branch)) {
          return { status: "rejected", reason: `Could not force-delete local branch \`${branch}\` (${detail}).` };
        }
        notices.push(`Could not delete the remote branch \`${branch}\` (${detail}).`);
      }
      branchDeleted = !(await branchExists(exec, branch));
    }
  }

  // Prune the stale remote-tracking ref a delete-on-merge left — last, after the
  // containment check read it. Best-effort: a prune failure (offline) does not undo
  // the completed branch/worktree teardown.
  let pruned = false;
  try {
    await fetchPrune({ exec }, { remote });
    pruned = true;
  } catch (err) {
    notices.push(`Could not prune stale tracking refs (${err instanceof Error ? err.message : String(err)}).`);
  }

  return {
    status: "torn-down",
    branch,
    branchDeleted,
    remoteBranchDeleted,
    worktreeRemoved,
    husk,
    pruned,
    notices,
    suggestion: suggestion ?? null,
  };
}

/**
 * Reap a recordless cheap branch by exact name. This is the branch-scoped sibling
 * of WU teardown's physical cleanup: no WU arc-state gate, no errand record, but
 * the same merged-safe containment check, worktree hop, and prune mechanics.
 */
export async function runBranchTeardown(
  ctx: TeardownContext,
  params: BranchTeardownParams,
): Promise<TeardownResult> {
  const branch = params.branch.trim();
  if (branch === "") return { status: "rejected", reason: "`--branch` requires a branch name." };
  const slug = branch.startsWith(CHEAP_BRANCH_PREFIX) ? branch.slice(CHEAP_BRANCH_PREFIX.length) : "";
  if (!branch.startsWith(CHEAP_BRANCH_PREFIX) || !isSlugSafe(slug)) {
    return {
      status: "rejected",
      reason:
        "`arc teardown --branch` is only for recordless `chore/<slug>` cheap branches " +
        "with a slug-safe suffix.",
    };
  }
  if (branch === params.base) {
    return { status: "rejected", reason: "`arc teardown --branch` refuses to target the configured base branch." };
  }

  const presence = await readBranchPresence(ctx.exec, branch);
  if (!presence.ok) {
    return { status: "rejected", reason: `Could not resolve local branch \`${branch}\` (${presence.message}).` };
  }
  return teardownBranchProjection(ctx, {
    branch: presence.present ? branch : null,
    subject: { kind: "branch", ref: branch },
    base: params.base,
    remote: params.remote,
    mode: "shipped",
    allowHusk: true,
    suggestion: params.suggestion,
  });
}

/**
 * Run `teardown`: gate on arc-state (mode-keyed — see {@link TeardownMode}),
 * resolve the WU branch, then compose the cleanup legs in their constraint-safe
 * order — worktree teardown (linked arm only; the in-place / absent arm is a
 * presence-guarded no-op), the branch delete (merged-safe + push-state-gated in
 * `shipped`; caller-authorized force in `abandoned`), and the prune. Rejects on a
 * gate mismatch (a not-yet-shipped WU in `shipped`, a `completed/` WU in
 * `abandoned`), an ambiguous branch match, or a dirty linked worktree.
 *
 * @param ctx - The git executor, index-scan seam, and locus-hop.
 * @param params - The target WU (and an optional remote / next-step suggestion).
 * @returns A rejection or the completed cleanup report.
 */
export async function runTeardown(ctx: TeardownContext, params: TeardownParams): Promise<TeardownResult> {
  const { cwd, exec, indexFs } = ctx;
  const { name, base, remote, suggestion } = params;
  const mode: TeardownMode = params.mode ?? "shipped";

  // 1. Arc-state authority gate — mode-keyed, resolved from location, never git.
  //    `shipped`: only a `completed/` WU (the merged-safe path's precondition).
  //    `abandoned`: the inverse — accept any *un-shipped* WU (a retired / parked
  //    origin), but refuse a `completed/` one so the force path can't reap a
  //    merged WU that the safe path handles.
  const index = await buildLifecycleIndex({ cwd, fs: indexFs });
  const shipped = isShipped(index, name);
  if (mode === "shipped" && !shipped) {
    return {
      status: "rejected",
      reason: `\`${name}\` has not shipped (no \`completed/\` presence) — teardown runs only after archive + merge.`,
    };
  }
  if (mode === "abandoned" && shipped) {
    return {
      status: "rejected",
      reason:
        `\`${name}\` has shipped (\`completed/\`) — use the default merged-safe teardown, not the force path.`,
    };
  }

  // 2. Resolve the WU branch by slug (type-prefix agnostic; meta `Branch` is `[none]` post-archive).
  const resolved = await resolveWuBranch(exec, name);
  if ("error" in resolved) return { status: "rejected", reason: resolved.error };
  const branch = resolved.branch;

  return teardownBranchProjection(ctx, {
    branch,
    subject: { kind: "work-unit", name },
    base,
    remote,
    mode,
    allowHusk: mode === "shipped",
    suggestion,
  });
}
