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
 *   WU resides in `completed/` (the `archive` transition ran), resolved from the
 *   protection-aware base ref rather than the potentially stale invoking
 *   checkout; (2) **preservation durability** — every local commit is provably
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
 *   `completed/` one is refused). Git-containment cannot prove safety for an
 *   unmerged branch, so committed retirement evidence and its exact live
 *   projection authorize leased remote cleanup and local OID compare-delete;
 *   the mode flag is never destructive authority.
 *
 * The branch name is resolved by enumerating local refs and matching the WU slug
 * ({@link branchToWorkUnitSlug}) — a ref-projection lookup, type-prefix agnostic,
 * because the meta `Branch` field is cleared to `[none]` at archive. A non-shipped
 * linked checkout is stamped and detached before remote/local ref resolution, and
 * outside physical removal waits until those persisted obligations resolve.
 *
 * @module
 */

import { isLandedInBase } from "../../git/branch-containment.js";
import type { GitExec } from "../../git/exec.js";
import { refreshBase } from "../../git/refresh-base.js";
import type { ProtectionMode } from "../../git/write-context.js";
import { decideHuskCleanup, isWorktreeClean } from "../../git/worktree-cleanup.js";
import {
  readWorktreeMarker,
  decodeWorktreeHuskStamp,
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
import { branchToWorkUnitSlug, readShippedWorkUnitsFromRef } from "../completed-index.js";
import {
  describeTeardownAuthorizationRefusal,
  type RetirementAuthorityPort,
  type TeardownAuthorizationDecision,
  type TeardownAuthorizationRequest,
} from "../retirement-authority.js";
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
import { isAbsolute, join, resolve } from "node:path";
import { parseMetaRecord } from "../../active/meta-reader.js";
import {
  createTeardownRetirementAuthority,
  revalidateHuskRetirementEvidence,
  type TeardownBlobReader,
} from "../teardown-retirement-driver.js";

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
  /** Retirement evidence authority used before any directional self-teardown. */
  authority?: Pick<RetirementAuthorityPort, "authorize" | "revalidate">;
  /** Exact committed-blob reader for authorization and replay artifact revalidation. */
  readBlob: TeardownBlobReader;
}

/**
 * Teardown mode — selects the arc-state gate and the branch-delete strategy. The
 * worktree / locus-hop / ordering / prune mechanics are identical in both.
 *
 * - `shipped` (default) — a `completed/` WU whose branch is merged. Gate:
 *   `completed/` presence on the protection-aware base ref. Branch delete: the merged-safe,
 *   containment-gated `delete-merged` — git-containment is the safety — plus a
 *   best-effort live-remote-head delete once the landed-in-base proof holds (a
 *   plain merge leaves the head to linger; delete-on-merge hosts already
 *   removed it, the idempotent no-op).
 * - `abandoned` — a *retired* / *parked* origin (decompose's removed origin, a
 *   `park@Planning` shelf) whose branch is **unmerged by construction**. Gate: the
 *   inverse — anything *not* shipped (a `completed/` WU must use the merged-safe
 *   path). The committed retirement receipt and exact ref projection authorize
 *   leased remote cleanup and local compare-and-delete; the mode flag alone never
 *   grants destructive authority.
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
  /** Configured result-projection model (unknown values normalize to `partial` at the handler). */
  protection?: ProtectionMode;
  /** Ephemeral next-step suggestion to surface (advisory; never persisted). */
  suggestion?: string;
  /** Exact absolute registered detached-husk path to replay. */
  huskPath?: string;
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
      huskRefusal?: "dirty" | "authorization-refused" | "preservation-unproven" | "user-surfaces";
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

async function hasCompetingWorktreeProjection(
  ctx: TeardownContext,
  branch: string,
  retiringPath: string,
): Promise<boolean> {
  const scan = await (ctx.scanWorktrees ?? scanRegisteredWorktrees)(ctx.exec);
  if (!scan.ok) return true;
  return scan.worktrees.some((entry) => entry.path !== retiringPath && entry.branch === branch);
}

async function hasCompetingLifecycleProjection(
  ctx: TeardownContext,
  branch: string,
  proof: Extract<TeardownAuthorizationDecision, { status: "authorized" }>,
  retiringPath: string,
): Promise<boolean> {
  const index = await buildLifecycleIndex({ cwd: ctx.cwd, fs: ctx.indexFs });
  const slug = branchToWorkUnitSlug(branch);
  if (slug === null) return false;
  const entry = index.get(slug);
  if (entry === undefined) return false;
  try {
    const content = await ctx.indexFs.readFile(join(ctx.cwd, entry.path));
    const declaredBranch = parseMetaRecord(content).Branch;
    if (
      (proof.evidence.expectedLifecycle === "completed" && entry.location === "completed")
      || (proof.evidence.expectedLifecycle === "planned" && entry.location === "planned")
    ) {
      return declaredBranch === branch && !isSelfTeardown(retiringPath, ctx.cwd);
    }
    if (
      proof.evidence.kind === "receipt"
      && proof.evidence.transition === "decompose"
      && proof.evidence.expectedLifecycle === "nonexistent"
      && declaredBranch === branch
      && isSelfTeardown(retiringPath, ctx.cwd)
    ) {
      return false;
    }
    return declaredBranch === branch;
  } catch {
    return true;
  }
}

interface TeardownBranchProjectionParams {
  branch: string | null;
  subject: WorktreeSubject;
  base: string;
  remote?: string;
  mode: TeardownMode;
  protection?: ProtectionMode;
  suggestion?: string;
  huskPath?: string;
}

async function relocatePrimaryToBase(
  exec: GitExec,
  primaryPath: string,
  base: string,
  baseRef: string,
): Promise<string | null> {
  try {
    await exec("git", ["switch", base], { cwd: primaryPath });
  } catch (err) {
    return err instanceof Error ? err.message : String(err);
  }
  // Land the developer on a current base: fast-forward local `base` to the
  // refreshed remote base (best-effort; a non-ff or unavailable base is left
  // as-is). Skipped when the remote base did not resolve (`baseRef === base`).
  if (baseRef !== base) {
    try {
      await exec("git", ["merge", "--ff-only", baseRef], { cwd: primaryPath });
    } catch {
      // Non-fast-forwardable (local base ahead) or unavailable — leave it as-is.
    }
  }
  return null;
}

async function teardownBranchProjection(
  ctx: TeardownContext,
  params: TeardownBranchProjectionParams,
): Promise<TeardownResult> {
  const { cwd, exec, chdir } = ctx;
  const { branch, subject, base, remote, mode, suggestion, huskPath } = params;
  const notices: string[] = [];
  const fs = ctx.worktreeFs ?? nodeReconcileWorktreeFs;
  const scan = await (ctx.scanWorktrees ?? scanRegisteredWorktrees)(exec);
  if (!scan.ok) {
    return { status: "rejected", reason: `Could not read registered worktrees (${scan.message}).` };
  }
  const primaryPath = scan.worktrees.find((worktree) => worktree.primary)?.path;

  // Refresh the base before the reap-safety check and any in-place relocation. The
  // landed-in-base leg checks patch-equivalence against `base`, but right after a
  // remote merge the *local* `base` is typically stale (the merge is on
  // `origin/<base>`, not yet pulled), so checking the local ref false-negatives a
  // merged branch — the order-dependence that forced a manual fetch + retry. Fetch
  // `origin/<base>` and evaluate against that authoritative ref instead. Best-effort:
  // offline / no-remote degrades to the local ref (prior behavior). Only meaningful
  // when a branch remains to reap.
  const protection = params.protection ?? "partial";
  const baseRef = mode === "shipped" || protection === "full"
    ? await refreshBase(exec, base, remote)
    : base;
  const evidenceBaseRef = mode === "abandoned" && protection === "partial" ? base : baseRef;

  // Worktree arm: shipped non-self cleanup retains the legacy physical-removal
  // choreography. Non-shipped linked projections instead become stamped detached
  // husks before any ref mutation; outside callers remove that husk only after its
  // persisted remote and local obligations resolve.
  let worktreeRemoved: string | null = null;
  let pendingHuskRemoval: DetachedCandidate | null = null;
  let husk: Extract<TeardownResult, { status: "torn-down" }>["husk"] = null;
  let directionalAuthorization: Extract<TeardownAuthorizationDecision, { status: "authorized" }> | null = null;
  let retiringProjectionPath: string | undefined;
  let pendingCreatedHuskRemoval: string | null = null;
  let pendingAuthorizedPrimaryRelocation: string | null = null;
  let directionalObligationsResolved = true;
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
    if (huskPath === undefined || resolve(worktree.path) === resolve(huskPath)) {
      matches.push({ path: worktree.path, head: worktree.head, marker: marker.marker });
    }
  }
  if (matches.length > 1) {
    return {
      status: "rejected",
      reason: `multiple detached worktrees match the requested terminal subject; choose one with --husk: ${matches.map((entry) => entry.path).join(", ")}`,
    };
  }
  if (huskPath !== undefined && matches.length === 0) {
    return { status: "rejected", reason: `no exact registered terminal husk matches \`${huskPath}\`` };
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
    const decoded = decodeWorktreeHuskStamp(stamp);
    if (decoded.kind === "manual-only") {
      return { status: "rejected", reason: `refusing detached husk removal: ${decoded.reason}` };
    }
    if (decoded.kind === "current") {
      directionalAuthorization = {
        status: "authorized",
        authorization: decoded.authorization,
        authorityVersion: "persisted-husk",
        evidence: decoded.evidence,
        refs: { localOid: stamp.sha, remote: decoded.remoteRef },
      };
      const evidenceValid = await revalidateHuskRetirementEvidence(
        exec,
        stamp,
        directionalAuthorization,
        evidenceBaseRef,
        ctx.readBlob,
      );
      if (!evidenceValid) {
        return { status: "rejected", reason: "refusing detached husk removal: retirement evidence mismatch" };
      }
    } else {
      try {
        const { stdout } = await exec("git", ["ls-remote", "--heads", remote ?? "origin", `refs/heads/${stamp.branch}`]);
        if (stdout.trim() !== "") {
          return { status: "rejected", reason: "legacy husk has no remote-delete authority" };
        }
      } catch {
        return { status: "rejected", reason: "legacy husk remote state is unavailable" };
      }
    }
    pendingHuskRemoval = detachedCandidate;
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
    const selfTeardown = registered !== undefined
      && registered.path !== primary
      && isSelfTeardown(registered.path, cwd);
    if (mode === "abandoned" && registered === undefined) {
      return {
        status: "rejected",
        reason: describeTeardownAuthorizationRefusal("projection-mismatch"),
        huskRefusal: "authorization-refused",
      };
    }
    const authorizationRequired = registered !== undefined && (mode === "abandoned" || selfTeardown);
    let authorizationRequest: TeardownAuthorizationRequest | null = null;
    let authority: Pick<RetirementAuthorityPort, "authorize" | "revalidate"> | null = null;
    if (authorizationRequired) {
      authorizationRequest = {
        subject,
        branch,
        head: registered.head,
        remote: remote ?? "origin",
        requestedMode: mode,
      };
      authority = ctx.authority ?? createTeardownRetirementAuthority(exec, evidenceBaseRef, ctx.readBlob);
      const authorization = await authority.authorize(authorizationRequest);
      if (authorization.status === "refused") {
        return {
          status: "rejected",
          reason: describeTeardownAuthorizationRefusal(authorization.reason),
          huskRefusal: "authorization-refused",
        };
      }
      directionalAuthorization = authorization;
      retiringProjectionPath = registered.path;
    }
    if (registered !== undefined && registered.path !== primary && (selfTeardown || mode === "abandoned")) {
      if (!(await isWorktreeClean({ exec, cwd: registered.path }))) {
        return {
          status: "rejected",
          reason: `cannot husk a dirty worktree: ${registered.path}`,
          huskRefusal: "dirty",
        };
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
      const reconciliation = await reconcileLinkedIdentityGlobalUserSurfaces({
        worktreePath: registered.path,
        primaryWorktreePath: primary,
        fs,
        signpost: true,
      });
      if (reconciliation.status === "blocked") {
        return { status: "rejected", reason: reconciliation.reason, huskRefusal: "user-surfaces" };
      }
      if (authority === null || authorizationRequest === null || directionalAuthorization === null) {
        return { status: "rejected", reason: "retirement authority is unavailable" };
      }
      const revalidation = await authority.revalidate(authorizationRequest, directionalAuthorization);
      if (revalidation.status === "refused") {
        return {
          status: "rejected",
          reason: describeTeardownAuthorizationRefusal(revalidation.reason),
          huskRefusal: "authorization-refused",
        };
      }
      let stamped = false;
      try {
        const stampResult = await (ctx.stampHusk ?? stampWorktreeHusk)(registered.path, {
          sha: registered.head,
          at: new Date((ctx.now ?? Date.now)()).toISOString(),
          subject,
          branch,
          authorization: directionalAuthorization.authorization,
          remoteRef: directionalAuthorization.refs.remote,
          evidence: directionalAuthorization.evidence,
        });
        stamped = stampResult.kind === "stamped";
        if (!stamped && mode !== "shipped") {
          return {
            status: "rejected",
            reason: `cannot prepare terminal stamp: ${stampResult.kind} ownership marker`,
            huskRefusal: "authorization-refused",
          };
        }
      } catch (err) {
        if (mode !== "shipped") {
          return {
            status: "rejected",
            reason: `cannot prepare terminal stamp: ${err instanceof Error ? err.message : String(err)}`,
            huskRefusal: "authorization-refused",
          };
        }
        notices.push(`Could not stamp the detached worktree (${err instanceof Error ? err.message : String(err)}).`);
      }
      await exec("git", ["switch", "--detach", directionalAuthorization.refs.localOid], { cwd: registered.path });
      husk = { worktreePath: registered.path, subject, branch, stamped, outcome: "created" };
      if (!selfTeardown) pendingCreatedHuskRemoval = registered.path;
    } else if (registered !== undefined && registered.path !== primary) {
      if (authorizationRequired) {
        if (authority === null || authorizationRequest === null || directionalAuthorization === null) {
          return { status: "rejected", reason: "retirement authority is unavailable" };
        }
        const revalidation = await authority.revalidate(authorizationRequest, directionalAuthorization);
        if (revalidation.status === "refused") {
          return {
            status: "rejected",
            reason: describeTeardownAuthorizationRefusal(revalidation.reason),
            huskRefusal: "authorization-refused",
          };
        }
      }
      try {
        await reconcileWorktree(
          { exec, chdir, fs },
          { mutation: "teardown", worktreePath: registered.path, currentLocus: cwd },
        );
      } catch (err) {
        return { status: "rejected", reason: err instanceof Error ? err.message : String(err) };
      }
      worktreeRemoved = registered.path;
    } else if (registered !== undefined && primary !== undefined && registered.path === primary) {
      // In-place arm: the branch is checked out in the *primary* worktree, so the
      // delete would be refused ("branch used by worktree"). Receipt-authorized
      // cleanup must resolve its remote obligation before relocation so a transport
      // failure leaves the exact branched projection available for reauthorization.
      // Shipped cleanup retains the legacy eager relocation path.
      if (authorizationRequired) {
        if (authority === null || authorizationRequest === null || directionalAuthorization === null) {
          return { status: "rejected", reason: "retirement authority is unavailable" };
        }
        const revalidation = await authority.revalidate(authorizationRequest, directionalAuthorization);
        if (revalidation.status === "refused") {
          return {
            status: "rejected",
            reason: describeTeardownAuthorizationRefusal(revalidation.reason),
            huskRefusal: "authorization-refused",
          };
        }
      }
      if (directionalAuthorization !== null) {
        pendingAuthorizedPrimaryRelocation = primary;
      } else {
        const relocationFailure = await relocatePrimaryToBase(exec, primary, base, baseRef);
        if (relocationFailure !== null) return { status: "rejected", reason: relocationFailure };
        notices.push(`Relocated the primary worktree to \`${base}\` before reaping \`${branch}\`.`);
      }
    }
  }

  // Branch delete — mode-keyed. `shipped` without a stamped authorization keeps
  // the merged-safe containment path. Stamped/receipt-backed cleanup resolves the
  // persisted remote disposition first, then compare-deletes the exact local OID;
  // unresolved obligations retain the path-addressable husk for replay.
  let branchDeleted = false;
  let remoteBranchDeleted = false;
  let localBranchDeleteFailed = false;
  const branchForCleanup = branch ?? husk?.branch ?? null;
  if (branchForCleanup !== null) {
    if (directionalAuthorization !== null) {
      const terminalPath = pendingHuskRemoval?.path ?? husk?.worktreePath ?? retiringProjectionPath;
      if (terminalPath === undefined) {
        directionalObligationsResolved = false;
        notices.push(`Retirement projection for \`${branchForCleanup}\` is not path-addressable; ref cleanup was vetoed.`);
      } else if (
        await hasCompetingWorktreeProjection(ctx, branchForCleanup, terminalPath)
        || await hasCompetingLifecycleProjection(ctx, branchForCleanup, directionalAuthorization, terminalPath)
      ) {
        directionalObligationsResolved = false;
        notices.push(`Competing registered projection owns \`${branchForCleanup}\`; ref cleanup was vetoed.`);
      } else {
        const remoteProof = directionalAuthorization.refs.remote;
        let remoteResolved = remoteProof === null;
        let primaryRelocatedForLocalDelete = false;
        if (remoteProof?.disposition === "delete") {
          try {
            const outcome = await deleteRemoteBranch(exec, remoteProof.remote, branchForCleanup, remoteProof.oid);
            remoteBranchDeleted = outcome === "deleted";
            remoteResolved = outcome !== "stale";
            if (outcome === "stale") {
              notices.push(`Remote branch \`${remoteProof.remote}/${branchForCleanup}\` moved; left intact.`);
            }
          } catch (err) {
            notices.push(
              `Could not delete the remote branch \`${branchForCleanup}\` `
                + `(${err instanceof Error ? err.message : String(err)}).`,
            );
          }
        } else if (remoteProof?.disposition === "retain") {
          try {
            const { stdout } = await exec("git", [
              "ls-remote", "--heads", remoteProof.remote, `refs/heads/${branchForCleanup}`,
            ]);
            remoteResolved = stdout.trim().split(/\s+/u)[0] === remoteProof.oid;
          } catch {
            remoteResolved = false;
          }
          if (!remoteResolved) {
            notices.push(
              `Remote preservation ref \`${remoteProof.remote}/${branchForCleanup}\` changed; left intact.`,
            );
          }
        }
        if (
          remoteResolved
          && !(await hasCompetingWorktreeProjection(ctx, branchForCleanup, terminalPath))
          && !(await hasCompetingLifecycleProjection(
            ctx,
            branchForCleanup,
            directionalAuthorization,
            terminalPath,
          ))
        ) {
          let localMutationReady = true;
          if (pendingAuthorizedPrimaryRelocation !== null) {
            const relocationFailure = await relocatePrimaryToBase(
              exec,
              pendingAuthorizedPrimaryRelocation,
              base,
              baseRef,
            );
            if (relocationFailure === null) {
              primaryRelocatedForLocalDelete = true;
              notices.push(`Relocated the primary worktree to \`${base}\` before reaping \`${branchForCleanup}\`.`);
            } else {
              localMutationReady = false;
              notices.push(
                `Could not relocate the primary worktree to \`${base}\` after resolving the remote obligation `
                  + `(${relocationFailure}); local branch \`${branchForCleanup}\` remains checked out for retry.`,
              );
            }
          }
          if (
            localMutationReady
            && primaryRelocatedForLocalDelete
            && (
              await hasCompetingWorktreeProjection(ctx, branchForCleanup, terminalPath)
              || await hasCompetingLifecycleProjection(
                ctx,
                branchForCleanup,
                directionalAuthorization,
                terminalPath,
              )
            )
          ) {
            localMutationReady = false;
            notices.push(
              `Competing registered projection owns \`${branchForCleanup}\`; local ref cleanup was vetoed.`,
            );
          }
          if (localMutationReady) {
            try {
              await exec("git", [
                "update-ref",
                "-d",
                `refs/heads/${branchForCleanup}`,
                directionalAuthorization.refs.localOid,
              ]);
            } catch (err) {
              notices.push(
                `Could not compare-and-delete local branch \`${branchForCleanup}\` `
                  + `(${err instanceof Error ? err.message : String(err)}).`,
              );
            }
          }
        }
        branchDeleted = !(await branchExists(exec, branchForCleanup));
        if (primaryRelocatedForLocalDelete && !branchDeleted && pendingAuthorizedPrimaryRelocation !== null) {
          try {
            await exec("git", ["switch", branchForCleanup], { cwd: pendingAuthorizedPrimaryRelocation });
            notices.push(
              `Restored the primary worktree to \`${branchForCleanup}\` after local ref cleanup did not complete.`,
            );
          } catch (err) {
            notices.push(
              `Could not restore the primary worktree to \`${branchForCleanup}\` `
                + `(${err instanceof Error ? err.message : String(err)}); restore it manually before retrying.`,
            );
          }
        }
        directionalObligationsResolved = remoteResolved && branchDeleted;
      }
    } else if (mode === "shipped") {
      // The landed-in-base proof gates the remote-head delete below. The reap
      // oracle accepts *either* preservation leg, and when only upstream
      // containment holds (e.g. a multi-commit squash, whose patch identity
      // cannot match), the remote head IS the preservation — deleting it would
      // discard the work. Computed before the local delete consumes the ref.
      const landedInBase = await isLandedInBase(exec, branchForCleanup, baseRef);
      try {
        await reconcileBranch({ exec }, { mutation: "delete-merged", branch: branchForCleanup, base: baseRef, remote });
      } catch (err) {
        if (husk === null) throw err;
        localBranchDeleteFailed = true;
        const retryLocus = worktreeRemoved === null ? "from the husk or primary" : "from the primary";
        notices.push(
          `Could not delete local branch \`${branchForCleanup}\` after detach ` +
            `(${err instanceof Error ? err.message : String(err)}); retry teardown ${retryLocus}.`,
        );
      }
      branchDeleted = !(await branchExists(exec, branchForCleanup));
      if (!branchDeleted) {
        if (!localBranchDeleteFailed) {
          notices.push(
            `Branch \`${branchForCleanup}\` is not contained on its upstream or landed in \`${baseRef}\` — left intact ` +
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
            (await deleteRemoteBranch(exec, remote ?? "origin", branchForCleanup)) === "deleted";
        } catch (err) {
          const detail = err instanceof Error ? err.message : String(err);
          notices.push(`Could not delete the remote branch \`${branchForCleanup}\` (${detail}).`);
        }
      } else {
        notices.push(
          `Remote branch \`${remote ?? "origin"}/${branchForCleanup}\` left intact — it is the only proven ` +
            `preservation (contained on the upstream, not patch-landed in \`${baseRef}\`).`,
        );
      }
    } else {
      return {
        status: "rejected",
        reason: "Refusing non-shipped branch cleanup without retirement authority.",
        huskRefusal: "authorization-refused",
      };
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

  const physicalRemovalPath = pendingHuskRemoval?.path ?? pendingCreatedHuskRemoval;
  if (physicalRemovalPath !== null && !isSelfTeardown(physicalRemovalPath, cwd)) {
    if (!directionalObligationsResolved || (branchForCleanup !== null && !branchDeleted)) {
      notices.push(`Detached husk \`${physicalRemovalPath}\` left intact until branch obligations resolve.`);
    } else {
      if (primaryPath === undefined) {
        return { status: "rejected", reason: "cannot resolve the primary worktree before husk removal" };
      }
      for (const dryRun of [true, false]) {
        const reconciliation = await reconcileLinkedIdentityGlobalUserSurfaces({
          worktreePath: physicalRemovalPath,
          primaryWorktreePath: primaryPath,
          fs,
          dryRun,
          signpost: true,
        });
        if (reconciliation.status === "blocked") {
          return { status: "rejected", reason: reconciliation.reason, huskRefusal: "user-surfaces" };
        }
      }
      try {
        await reconcileWorktree(
          { exec, chdir, fs },
          {
            mutation: "teardown",
            worktreePath: physicalRemovalPath,
            currentLocus: cwd,
            huskApproved: true,
          },
        );
        worktreeRemoved = physicalRemovalPath;
      } catch (err) {
        return { status: "rejected", reason: err instanceof Error ? err.message : String(err) };
      }
    }
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
    suggestion: params.suggestion,
  });
}

/**
 * Run `teardown`: gate on arc-state (mode-keyed — see {@link TeardownMode}),
 * resolve the WU branch, then compose the cleanup legs in their constraint-safe
 * order — projection preparation, remote disposition, exact local ref mutation,
 * deferred physical removal, and prune. Shipped cleanup keeps its merged-safe,
 * push-state-gated compatibility path; abandoned cleanup requires receipt-backed
 * retirement authority. Rejects on a
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
  if (params.huskPath !== undefined && !isAbsolute(params.huskPath)) {
    return { status: "rejected", reason: "`--husk` requires an absolute worktree path." };
  }

  // 1. Arc-state authority gate — mode-keyed and read from the configured base
  //    authority so a stale linked checkout cannot overrule landed lifecycle
  //    state. Full protection trusts the remote base; partial protection trusts
  //    the locally integrating base. Direct library callers that omit the
  //    protection model retain the historical checkout-local seam; the CLI
  //    always supplies the configured model.
  //    `shipped`: only a `completed/` WU (the merged-safe path's precondition).
  //    `abandoned`: the inverse — accept any *un-shipped* WU (a retired / parked
  //    origin), but refuse a `completed/` one so the retirement path can't reap a
  //    merged WU that the safe path handles.
  const shipped = params.protection === undefined
    ? isShipped(await buildLifecycleIndex({ cwd, fs: indexFs }), name)
    : (await readShippedWorkUnitsFromRef(
        exec,
        params.protection === "full" ? `${remote ?? "origin"}/${base}` : base,
      )).has(name);
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
    protection: params.protection,
    huskPath: params.huskPath,
    suggestion,
  });
}
