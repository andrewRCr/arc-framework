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
  StatusIdentity,
  StatusResult,
} from "./types.js";

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

  const userTask: Promise<SessionInitProbeResult["user"]> = identity === null
    ? Promise.resolve(identityMissing())
    : safeProbe(() => probes.user(identity));
  const worktreeTask = safeProbe(() => probes.worktree());
  const extensionsTask = safeProbe(() => probes.extensions());
  const configTask = safeProbe(() => probes.config());
  const activeTask = safeProbe(() => probes.active(identity, role));
  const domainRulesTask = safeProbe(() => probes.domainRules());

  const [user, worktree, extensions, config, active, domainRules] = await Promise.all([
    userTask,
    worktreeTask,
    extensionsTask,
    configTask,
    activeTask,
    domainRulesTask,
  ]);

  // Cross-channel qualifier: when the notes-clean verdict is true only
  // because local HEAD is behind origin, attach the qualifier to user
  // so downstream consumers can reason about reachability.
  const qualifiedUser =
    user.ok && user.value.state === "clean" &&
      worktree.ok && worktree.value.state === "remote-ahead"
      ? { ...user, value: { ...user.value, qualifier: "clean-at-current-head" as const } }
      : user;

  return {
    mode: "session-init",
    identity: buildIdentity(identity, role),
    user: qualifiedUser,
    worktree,
    extensions,
    config,
    active,
    domainRules,
  };
}

/**
 * Run the session-handoff composite probe.
 *
 * Self-contained envelope for the arc-handoff workflow. Fans out to seven
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
  const pushInterlockTask = safeProbe(() => probes.pushInterlock());
  const syncPushTask = safeProbe(() => probes.syncPush());
  const activeTask = safeProbe(() => probes.active(identity, role));
  const headTask = safeProbe(() => probes.head());
  const pushabilityTask = safeProbe(() => probes.pushability());

  const [dirty, worktree, user, pushInterlock, syncPush, active, head, pushability] = await Promise.all([
    dirtyTask,
    worktreeTask,
    userTask,
    pushInterlockTask,
    syncPushTask,
    activeTask,
    headTask,
    pushabilityTask,
  ]);

  return {
    mode: "session-handoff",
    identity: buildIdentity(identity, role),
    dirty,
    worktree,
    user,
    pushInterlock,
    syncPush,
    active,
    head,
    pushability,
  };
}
