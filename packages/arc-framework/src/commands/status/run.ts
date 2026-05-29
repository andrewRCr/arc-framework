/**
 * Composite `arc status` orchestrators.
 *
 * Two entry points:
 *
 * - {@link runStatus} — full-mode composite (default rendering).
 * - {@link runSessionInitStatus} — session-init-scoped composite consumed
 *   by the harness. Replaces Batch 1's four probe invocations + two
 *   `git config` reads with a single CLI call.
 *
 * Both fan out via `Promise.all` over the four probe slots (user, extensions,
 * config, active) with per-slot rejection wrapped into a typed {@link Probe}
 * error. The composite itself never rejects on a probe failure — the session-
 * init workflow decides how to respond based on the result shape.
 *
 * Identity/role are resolved in the handler and passed in as pointers; the
 * composite only short-circuits the user slot when `identity` is absent
 * (user notes are identity-scoped). `config` and `identity` are independent —
 * config settings live in arc-config.yml, identity lives in git config.
 *
 * @module
 */

import type {
  ProbeError,
  RunSessionHandoffStatusOptions,
  RunSessionInitStatusOptions,
  RunStatusOptions,
  SessionHandoffResult,
  SessionInitProbeResult,
  SessionInitUserValue,
  SessionInitWorktreeValue,
  StatusIdentity,
  StatusResult,
  WorktreeIdentity,
} from "./types.js";
import {
  inferSessionInitRecommendations,
  type NotesPullPolicy,
  type WorktreePullPolicy,
} from "../../lib/session-init/recommended-action.js";
import { inferRecommendedSummaryLine } from "../../lib/handoff/recommended-summary-line.js";
import type { DirtyStateResult } from "../../lib/git/dirty-state.js";

const IDENTITY_MISSING_MESSAGE =
  "User probe skipped: `arc.identity` is not configured in git config.";

/**
 * Error-branch shape of `Probe<T>`. Split out so the helpers below avoid
 * a generic parameter whose only role is to unify with the ok branch —
 * otherwise TypeScript infers `T = unknown` in the `.then(ok, fromRejection)`
 * chain and the composite result types reject the promise assignment.
 */
type ProbeErrorSlot = { ok: false; error: ProbeError };

function ok<T>(value: T): { ok: true; value: T } {
  return { ok: true, value };
}

function fromRejection(err: unknown): ProbeErrorSlot {
  const message = err instanceof Error ? err.message : String(err);
  return { ok: false, error: { kind: "runtime", message } };
}

/**
 * Wrap a probe invocation so a synchronous throw during invocation or
 * parameter validation is caught and converted into a resolved Probe error,
 * preserving the documented "envelope itself never rejects" contract.
 *
 * `Promise.resolve().then(probe)` evaluates `probe()` inside a microtask:
 * synchronous throws become rejections of the resulting promise, which
 * `fromRejection` then captures.
 */
function safeProbe<T>(
  probe: () => Promise<T>,
): Promise<{ ok: true; value: T } | ProbeErrorSlot> {
  return Promise.resolve().then(probe).then(ok, fromRejection);
}

function identityMissing(): ProbeErrorSlot {
  return {
    ok: false,
    error: { kind: "identity-missing", message: IDENTITY_MISSING_MESSAGE },
  };
}

function buildIdentity(identity: string | null, role: string | null): StatusIdentity {
  return { identity, role };
}

/**
 * Run the full-mode composite probe.
 *
 * Parallel orchestration via `Promise.all` over four probe slots. Identity is
 * read in the handler (`git config arc.identity` / `arc.role`) and passed as
 * pointers; when `identity` is `null` the user slot resolves to an
 * `identity-missing` {@link Probe} error without invoking the user probe.
 */
export async function runStatus(options: RunStatusOptions): Promise<StatusResult> {
  const { identity, role, probes } = options;

  const userTask: Promise<StatusResult["user"]> = identity === null
    ? Promise.resolve(identityMissing())
    : safeProbe(() => probes.user(identity));
  const extensionsTask = safeProbe(() => probes.extensions());
  const configTask = safeProbe(() => probes.config());
  const activeTask = safeProbe(() => probes.active());

  const [user, extensions, config, active] = await Promise.all([
    userTask,
    extensionsTask,
    configTask,
    activeTask,
  ]);

  return {
    mode: "full",
    identity: buildIdentity(identity, role),
    user,
    extensions,
    config,
    active,
  };
}

/** Run the session-init-scoped composite probe — same orchestration, scoped slot shapes. */
export async function runSessionInitStatus(
  options: RunSessionInitStatusOptions,
): Promise<SessionInitProbeResult> {
  const { identity, role, probes } = options;

  type RawUser = { ok: true; value: import("../user/types.js").UserSessionInitStatusResult }
    | ProbeErrorSlot;
  type RawWorktree = { ok: true; value: import("../../lib/git/worktree-sync.js").WorktreeSyncStatusResult }
    | ProbeErrorSlot;
  type RawRetired =
    | { ok: true; value: import("../../lib/session-init/retired-subdir-detection.js").RetiredSubdirDetectionResult }
    | ProbeErrorSlot;
  type RawErrandSweep =
    | { ok: true; value: import("../../lib/session-init/errand-staleness-sweep.js").ErrandStalenessSweepResult }
    | ProbeErrorSlot;

  const userTask: Promise<RawUser> = identity === null
    ? Promise.resolve(identityMissing())
    : safeProbe(() => probes.user(identity));
  const worktreeTask: Promise<RawWorktree> = safeProbe(() => probes.worktree());
  const worktreeIdentityTask = safeProbe(() => probes.worktreeIdentity());
  const dirtyTask = safeProbe(() => probes.dirty());
  const extensionsTask = safeProbe(() => probes.extensions());
  const configTask = safeProbe(() => probes.config());
  const activeTask = safeProbe(() => probes.active(identity, role));
  const domainRulesTask = safeProbe(() => probes.domainRules());
  const releaseRoutingTask = safeProbe(() => probes.releaseRouting());
  // Retired-subdir detection rides the eager phase (no roster dependency); it
  // needs identity to resolve a user dir, so it is omitted when identity is
  // absent. `null` here means "not computed" — distinct from an empty result.
  const retiredSubdirsTask: Promise<RawRetired | null> = identity === null
    ? Promise.resolve(null)
    : safeProbe(() => probes.retiredSubdirs(identity));
  // Errand-staleness sweep rides the same eager / identity-gated phase: the
  // queue is identity-scoped, so it is omitted when identity is absent.
  const errandSweepTask: Promise<RawErrandSweep | null> = identity === null
    ? Promise.resolve(null)
    : safeProbe(() => probes.errandSweep(identity));

  const [
    user, worktree, worktreeIdentitySlot, dirty, extensions, config, active,
    domainRules, releaseRouting, retiredSubdirs, errandSweep,
  ] = await Promise.all([
    userTask,
    worktreeTask,
    worktreeIdentityTask,
    dirtyTask,
    extensionsTask,
    configTask,
    activeTask,
    domainRulesTask,
    releaseRoutingTask,
    retiredSubdirsTask,
    errandSweepTask,
  ]);

  // Worktree identity is non-critical and always-on: a failed probe degrades
  // to "primary" (surface nothing) rather than masking the whole worktree slot.
  const worktreeIdentity: WorktreeIdentity = worktreeIdentitySlot.ok
    ? worktreeIdentitySlot.value
    : { kind: "primary" };

  // Cross-channel qualifier: when the notes-clean verdict is true only
  // because local HEAD is behind origin, attach the qualifier to user
  // so downstream consumers can reason about reachability.
  const qualifiedUser: RawUser =
    user.ok && user.value.state === "clean" &&
      worktree.ok && worktree.value.state === "remote-ahead"
      ? { ...user, value: { ...user.value, qualifier: "clean-at-current-head" as const } }
      : user;

  const recommendations = composeSessionInitRecommendations({
    worktree,
    user: qualifiedUser,
    dirty,
    config,
  });

  const enrichedWorktree: SessionInitProbeResult["worktree"] = worktree.ok
    ? {
      ok: true,
      value: {
        ...worktree.value,
        recommendedAction: recommendations.worktree.recommendedAction,
        recommendedPromptText: recommendations.worktree.recommendedPromptText,
        identity: worktreeIdentity,
      } satisfies SessionInitWorktreeValue,
    }
    : worktree;

  const enrichedUser: SessionInitProbeResult["user"] = qualifiedUser.ok
    ? {
      ok: true,
      value: {
        ...qualifiedUser.value,
        recommendedAction: recommendations.user.recommendedAction,
        recommendedPromptText: recommendations.user.recommendedPromptText,
      } satisfies SessionInitUserValue,
    }
    : qualifiedUser;

  // Two-stage orchestration seam. The eager `Promise.all` above is the first
  // stage. The in-flight roster is the lone conditional-expensive slot: its
  // gating signals — worktree state, active resolution, and worktree identity —
  // are produced by sibling slots in that fan-out, so it can only fire once they
  // resolve. We gate on those resolved values and run the roster scan in a
  // second stage; on the linked-worktree resume path the gate is false, the
  // scan never runs, and the slot is omitted, so resume latency is unchanged.
  // The primary-worktree arm fires it for the stale-worktree sweep — a main
  // session recurs often enough to bound the lingering window. `safeProbe`
  // preserves the "envelope never rejects" contract for the roster too. Kept
  // deliberately minimal — one named conditional stage, not a general
  // gated-slot framework.
  const rosterGated =
    (worktree.ok && worktree.value.state === "branch-gone") ||
    (active.ok && active.value.resolution === "none") ||
    worktreeIdentity.kind === "primary";
  const roster = rosterGated
    ? await safeProbe(() => probes.roster())
    : undefined;

  // Branch-gone recovery — a gated consumer of the roster, narrower than the
  // roster gate (branch-gone only). It consumes the roster resolved just above,
  // so one roster computation feeds every consumer and recovery fires only when
  // the worktree is branch-gone and the roster resolved.
  const recovery =
    worktree.ok && worktree.value.state === "branch-gone" && roster?.ok
      ? await safeProbe(() => probes.recovery(roster.value, worktree.value.branch))
      : undefined;

  // Stale-worktree sweep — a second roster consumer, gated to the primary (main)
  // worktree. Cross-references the roster against `.arc/completed/` and resolves
  // each lingering shipped-WU worktree's cleanup disposition. Fires only when
  // the session is in the primary worktree and the roster resolved.
  const sweep =
    worktreeIdentity.kind === "primary" && roster?.ok
      ? await safeProbe(() => probes.sweep(roster.value, worktreeIdentity))
      : undefined;

  return {
    mode: "session-init",
    identity: buildIdentity(identity, role),
    user: enrichedUser,
    worktree: enrichedWorktree,
    dirty,
    extensions,
    config,
    active,
    domainRules,
    releaseRouting,
    ...(roster !== undefined ? { roster } : {}),
    ...(recovery !== undefined ? { recovery } : {}),
    ...(sweep !== undefined ? { sweep } : {}),
    ...(retiredSubdirs !== null ? { retiredSubdirs } : {}),
    ...(errandSweep !== null ? { errandSweep } : {}),
    recommendedCombinedPrompt: recommendations.recommendedCombinedPrompt,
  };
}

/**
 * Compose recommendations from resolved probe slots. Falls back to skip-
 * everything when any required input failed to resolve — the workflow
 * surfaces probe-failure diagnostics separately, so recommendations stay
 * neutral rather than guessing.
 */
function composeSessionInitRecommendations(slots: {
  worktree: { ok: true; value: import("../../lib/git/worktree-sync.js").WorktreeSyncStatusResult } | ProbeErrorSlot;
  user: { ok: true; value: import("../user/types.js").UserSessionInitStatusResult } | ProbeErrorSlot;
  dirty: { ok: true; value: DirtyStateResult } | ProbeErrorSlot;
  config: { ok: true; value: import("../config/types.js").ConfigSessionInitResult } | ProbeErrorSlot;
}): ReturnType<typeof inferSessionInitRecommendations> {
  if (!slots.worktree.ok || !slots.dirty.ok || !slots.config.ok) {
    return {
      worktree: { recommendedAction: "skip", recommendedPromptText: "" },
      user: { recommendedAction: "skip", recommendedPromptText: "" },
      recommendedCombinedPrompt: null,
    };
  }
  const settings = slots.config.value.settings;
  return inferSessionInitRecommendations({
    worktree: slots.worktree.value,
    user: slots.user.ok ? slots.user.value : null,
    worktreePullPolicy: normalizeWorktreePolicy(settings["session.init_pull.worktree"]),
    notesPullPolicy: normalizeNotesPolicy(settings["session.init_pull.notes"]),
    dirty: slots.dirty.value,
  });
}

function normalizeWorktreePolicy(raw: string): WorktreePullPolicy {
  return raw === "manual" ? "manual" : "prompt";
}

function normalizeNotesPolicy(raw: string): NotesPullPolicy {
  if (raw === "manual") return "manual";
  if (raw === "always") return "always";
  return "prompt";
}

/**
 * Run the session-handoff composite probe.
 *
 * Self-contained envelope for the arc-handoff workflow. Fans out the active
 * slots in parallel; per-slot failures wrap into `Probe` errors so the
 * envelope itself never rejects. Identity is resolved in the handler and
 * passed in as pointers; when `identity` is `null` the user (notes-sync)
 * slot short-circuits without invoking its probe.
 */
export async function runSessionHandoffStatus(
  options: RunSessionHandoffStatusOptions,
): Promise<SessionHandoffResult> {
  const { identity, role, probes } = options;

  const dirtyTask = safeProbe(() => probes.dirty());
  const worktreeTask = safeProbe(() => probes.worktree());
  const userTask: Promise<SessionHandoffResult["user"]> = identity === null
    ? Promise.resolve(identityMissing())
    : safeProbe(() => probes.user(identity));
  const syncInterlockTask = safeProbe(() => probes.syncInterlock());
  const activeTask = safeProbe(() => probes.active(identity, role));
  const headTask = safeProbe(() => probes.head());
  const pushabilityTask = safeProbe(() => probes.pushability());
  const restateCandidatesTask = safeProbe(() => probes.restateCandidates());
  const releaseRoutingTask = safeProbe(() => probes.releaseRouting());

  const [
    dirty, worktree, user, syncInterlock, active, head, pushability,
    restateCandidates, releaseRouting,
  ] = await Promise.all([
    dirtyTask,
    worktreeTask,
    userTask,
    syncInterlockTask,
    activeTask,
    headTask,
    pushabilityTask,
    restateCandidatesTask,
    releaseRoutingTask,
  ]);

  const branch = worktree.ok ? worktree.value.branch : null;

  const recommendedSummaryLine = worktree.ok
    ? inferRecommendedSummaryLine({
      context: "sync-skipped",
      worktreeState: worktree.value.state,
      ahead: worktree.value.ahead,
      behind: worktree.value.behind,
      branch,
      unpushedN: worktree.value.ahead,
    })
    : null;

  return {
    mode: "session-handoff",
    identity: buildIdentity(identity, role),
    branch,
    dirty,
    worktree,
    user,
    syncInterlock,
    active,
    head,
    pushability,
    restateCandidates,
    releaseRouting,
    recommendedSummaryLine,
  };
}
