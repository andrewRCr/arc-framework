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
  RunSessionInitStatusOptions,
  RunStatusOptions,
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
    : probes.user(identity).then(ok, fromRejection);
  const extensionsTask = probes.extensions().then(ok, fromRejection);
  const configTask = probes.config().then(ok, fromRejection);
  const activeTask = probes.active().then(ok, fromRejection);

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
    : probes.user(identity).then(ok, fromRejection);
  const extensionsTask = probes.extensions().then(ok, fromRejection);
  const configTask = probes.config().then(ok, fromRejection);
  const activeTask = probes.active().then(ok, fromRejection);
  const domainRulesTask = probes.domainRules().then(ok, fromRejection);

  const [user, extensions, config, active, domainRules] = await Promise.all([
    userTask,
    extensionsTask,
    configTask,
    activeTask,
    domainRulesTask,
  ]);

  return {
    mode: "session-init",
    identity: buildIdentity(identity, role),
    user,
    extensions,
    config,
    active,
    domainRules,
  };
}
