/**
 * `arc release push` handler — orchestrator for refusal and success paths.
 *
 * Composes the destructive-flag detector, active-WU resolver,
 * branch-protection check, pushability matrix, and interlock check into a
 * short-circuit cascade (12 → 10 → 13 → 14 → 11): cheapest checks fire
 * first, with pushability (14) inserted between branch-protection (13) and
 * interlock (11). Each refusal exits with the matched refusal code, prints
 * a `formatRefusal()` message, writes a `decision: "refused"` audit entry,
 * and never invokes the wrapped `git push`.
 *
 * **Pushability disposition handling.** Conditions surfaced by
 * {@link runPushabilityStatus} are filtered to the refusal-causing subset:
 * any `block` disposition, plus the `force-push-required` advisory which
 * inherits the always-refuse contract from `pushability.ts`'s preamble.
 * `auto-fixed` dispositions pass through — the matrix self-resolved the
 * issue, so the wrapper does not refuse.
 *
 * **Settings resolution.** Callers pass a pre-resolved
 * `ResolvedSettingsResult`. Resolving once at the handler boundary and
 * threading the result through validation and audit-entry write keeps
 * this orchestrator I/O-narrow and prevents drift between read sites.
 *
 * @module
 */

import {
  appendAuditEntry,
  sanitizeArgs,
  toAuditWorkUnit,
} from "../../lib/release/audit-log.js";
import { normalizeReleasePushArgs } from "../../lib/release/arg-grammar.js";
import { detectPushDestructive } from "../../lib/release/destructive-flags.js";
import {
  checkBranchProtection,
  checkInterlock,
  formatRefusal,
} from "../../lib/release/interlock-validation.js";
import { resolveActiveWu } from "../../lib/release/wu-resolution.js";
import type {
  AuditEntry,
  AuditInterlockState,
  AuditOutcome,
  AuditWorkUnit,
  AuthorizationDecision,
  RefusalCode,
} from "../../lib/release/types.js";
import { isRefusalCondition } from "../../lib/git/pushability.js";
import type {
  PushabilityCondition,
  PushabilityResult,
} from "../../lib/git/pushability.js";
import type { PushInterlock, ResolvedSettingsResult } from "../../lib/config/resolved-settings.js";

const SET_UPSTREAM_FLAGS: ReadonlySet<string> = new Set(["-u", "--set-upstream"]);

/**
 * Outcome of evaluating whether the wrapper should resolve a
 * `caller-resolvable` `no-upstream-branch` condition inline by injecting
 * `-u` into the wrapped spawn.
 *
 * - `none`: pushability did not surface `no-upstream-branch`; standard flow.
 * - `resolved`: condition surfaced and the caller is permitted to resolve
 *   (argv-declared `-u`, or `pushInterlock !== "manual"`). The caller filters
 *   the condition out of the refusal set and injects `-u` if not already in
 *   argv.
 * - `would-refuse`: condition surfaced and neither permission signal applied;
 *   the condition stays in the refusal set and the wrapper refuses with the
 *   matrix-supplied `Set upstream first` guidance.
 */
type UpstreamInjection =
  | { kind: "none" }
  | { kind: "resolved"; alreadyInArgv: boolean }
  | { kind: "would-refuse" };

/**
 * Apply the argv-as-intent OR config-authorized-cascade rule for the
 * `no-upstream-branch` caller-resolvable condition. Pure function — settings
 * value flows in pre-resolved, no I/O.
 */
function decideUpstreamInjection(
  conditions: readonly PushabilityCondition[],
  spawnArgs: readonly string[],
  pushInterlock: PushInterlock,
): UpstreamInjection {
  const noUpstream = conditions.find((c) => c.kind === "no-upstream-branch");
  if (noUpstream === undefined) return { kind: "none" };

  const alreadyInArgv = spawnArgs.some((a) => SET_UPSTREAM_FLAGS.has(a));
  const configPermits = pushInterlock !== "manual";

  if (alreadyInArgv || configPermits) {
    return { kind: "resolved", alreadyInArgv };
  }
  return { kind: "would-refuse" };
}

/**
 * Pushability matrix probe used by the orchestrator. The CLI adapter
 * binds the real {@link runPushabilityStatus} with a `target: "worktree"`
 * invocation; tests inject a fake returning a synthetic result. Wrapping
 * the probe at the dependency boundary keeps the orchestrator pure (no
 * git plumbing import drift).
 */
export type RunPushability = () => Promise<PushabilityResult>;

export interface SpawnPushOptions {
  branch: string;
  args: readonly string[];
  cwd: string;
}

/**
 * Outcome of a wrapped `git push` invocation. The orchestrator pins
 * `exitCode` on the failed arm so audit attribution doesn't depend on
 * parsing it back out of an `Error.message`; the CLI adapter reshapes
 * `pushWorktreeBranch`'s result into this shape at the dep boundary.
 */
export type SpawnPushOutcome =
  | { status: "success"; stdout: string; stderr: string }
  | { status: "failed"; exitCode: number; stdout: string; stderr: string };

/**
 * Wrapped `git push` invocation. Refusal-cascade tests assert this dep is
 * never called. The CLI adapter binds the helper with `inheritStdio: true`;
 * the orchestrator's authorize branch invokes it and produces a
 * `kind: "push"` or `kind: "hook-failed"` audit entry.
 */
export type SpawnPush = (opts: SpawnPushOptions) => Promise<SpawnPushOutcome>;

export interface ReleasePushDeps {
  cwd: string;
  identity: string;
  argv: readonly string[];
  settings: ResolvedSettingsResult;
  currentBranch: string;
  /**
   * Pushability matrix probe. Refusal cascade calls this only after the
   * 12 / 10 / 13 gates pass — the refusal path remains I/O-narrow on the
   * common failure modes.
   */
  runPushability: RunPushability;
  /**
   * Wrapped `git push` invocation. Called only when the cascade authorizes
   * the operation; the refusal cascade never calls this.
   */
  spawnPush: SpawnPush;
  /** Sink for refusal messages. Defaults to `process.stderr.write`. */
  writeStderr?: (msg: string) => void;
  /** Audit-entry writer. Defaults to {@link appendAuditEntry}. */
  appendAudit?: AppendAudit;
}

export interface ReleasePushResult {
  exitCode: number;
}

/** Audit-entry writer signature. Defaulted to {@link appendAuditEntry}. */
export type AppendAudit = (opts: {
  cwd: string;
  identity: string;
  entry: AuditEntry;
}) => Promise<{ ok: true } | { ok: false; error: Error }>;

/**
 * Run the release-push cascade and return the resulting exit code.
 * Refusal paths emit a refusal message via `writeStderr`, persist an
 * audit entry, and return the matched refusal code. The authorize
 * branch invokes `spawnPush`, attributes the outcome (exit 0 → audit
 * `kind: "push"` with parsed `refStatus`; non-zero → `kind: "hook-failed"`
 * with hook attribution from captured stderr), writes one
 * `decision: "proceeded"` audit entry, and bubbles git's exit code
 * verbatim.
 */
export async function runReleasePush(
  deps: ReleasePushDeps,
): Promise<ReleasePushResult> {
  const writeStderr = deps.writeStderr ?? ((msg) => { process.stderr.write(msg); });
  const appendAudit = deps.appendAudit ?? appendAuditEntry;

  // Step 1 (no I/O): destructive flag in argv.
  const flag = detectPushDestructive(deps.argv);
  if (flag !== null) {
    return refuse(
      { kind: "refuse", code: 12, identifier: "destructive-flag", flag },
      { wu: null, deps, writeStderr, appendAudit },
    );
  }

  // Step 1b (no I/O): positional `<remote> <branch>` arg-grammar check (15).
  // Strips matched positionals before they reach the wrapped spawn (which
  // already prepends `origin <current-branch>`); refuses on mismatch.
  const normalized = normalizeReleasePushArgs(deps.argv, deps.currentBranch);
  if (normalized.kind === "mismatch") {
    return refuse(
      {
        kind: "refuse",
        code: 15,
        identifier: "arg-grammar-fallthrough",
        detail: {
          reason: "positional-ref-mismatch",
          attempted: normalized.attempted,
          expected: normalized.expected,
        },
      },
      { wu: null, deps, writeStderr, appendAudit },
    );
  }
  const spawnArgs = normalized.args;

  // Step 2 (fs probe): resolve active WU. Zero-candidate (`none`) is accepted —
  // symmetric with commit — so only multi-candidate ambiguity refuses (code 10).
  const wu = await resolveActiveWu({ cwd: deps.cwd });
  if (wu.status === "ambiguous") {
    return refuse(
      { kind: "refuse", code: 10, identifier: "ambiguous-active-wu", hint: wu.hint },
      { wu: null, deps, writeStderr, appendAudit },
    );
  }
  const wuAudit = wu.status === "resolved" ? toAuditWorkUnit(wu) : null;

  // Step 3 (config + git): branch-protection (13).
  const branchDecision = checkBranchProtection({
    operation: "push",
    settings: deps.settings,
    currentBranch: deps.currentBranch,
  });
  if (branchDecision !== null) {
    return refuse(branchDecision, { wu: wuAudit, deps, writeStderr, appendAudit });
  }

  // Step 4 (rev-list + git config reads): pushability matrix (14).
  const pushability = await deps.runPushability();
  const upstreamInjection = decideUpstreamInjection(
    pushability.conditions,
    spawnArgs,
    deps.settings.resolved.pushInterlock.value,
  );
  const conditionsAfterResolution = upstreamInjection.kind === "resolved"
    ? pushability.conditions.filter((c) => c.kind !== "no-upstream-branch")
    : pushability.conditions;
  const refusalConditions = filterRefusalConditions(conditionsAfterResolution);
  if (refusalConditions.length > 0) {
    return refuse(
      {
        kind: "refuse",
        code: 14,
        identifier: "pushability-precheck-failed",
        conditions: refusalConditions,
      },
      { wu: wuAudit, deps, writeStderr, appendAudit },
    );
  }

  // Step 5 (config read): interlock (11).
  const interlockDecision = checkInterlock({
    operation: "push",
    settings: deps.settings,
    currentBranch: deps.currentBranch,
  });
  if (interlockDecision.kind === "refuse") {
    return refuse(interlockDecision, { wu: wuAudit, deps, writeStderr, appendAudit });
  }

  // Authorize: run wrapped `git push`, attribute the outcome, audit, exit.
  // `spawnArgs` carries `deps.argv` with any matched positional ref-pairs
  // stripped — the audit entry still reflects the original argv. When
  // pushability surfaced a `no-upstream-branch` condition and the caller is
  // permitted to resolve it (argv-declared `-u`, or `pushInterlock != manual`),
  // inject `-u` into the wrapped spawn so the push sets upstream on first land.
  const finalSpawnArgs = upstreamInjection.kind === "resolved" && !upstreamInjection.alreadyInArgv
    ? ["-u", ...spawnArgs]
    : spawnArgs;
  const spawned = await deps.spawnPush({
    branch: deps.currentBranch,
    args: finalSpawnArgs,
    cwd: deps.cwd,
  });
  const outcome: AuditOutcome = spawned.status === "success"
    ? { kind: "push", refStatus: parseRefStatus(spawned.stderr) }
    : {
        kind: "hook-failed",
        hook: detectPushHook(`${spawned.stdout}\n${spawned.stderr}`),
        exitCode: spawned.exitCode,
      };

  const auditResult = await appendAudit({
    cwd: deps.cwd,
    identity: deps.identity,
    entry: buildAuditEntry({
      deps,
      wu: wuAudit,
      decision: "proceeded",
      refusalCode: null,
      outcome,
    }),
  });
  surfaceAuditFailure(auditResult, writeStderr);

  return { exitCode: spawned.status === "success" ? 0 : spawned.exitCode };
}

/**
 * Surface a failed audit-write to stderr without propagating. Audit logging
 * is sidecar to the wrapper outcome — a write failure shouldn't mask a
 * successful push, but it must be visible so the operator can investigate
 * the gap rather than silently losing the entry.
 */
function surfaceAuditFailure(
  result: { ok: true } | { ok: false; error: Error },
  writeStderr: (msg: string) => void,
): void {
  if (result.ok) return;
  writeStderr(`warn: audit-log write failed: ${result.error.message}\n`);
}

/**
 * Parse a coarse `refStatus` summary from the captured `git push` stderr.
 * Matches the first whitespace-led line containing `->` (the per-ref
 * status line, e.g., `   abc..def  main -> main`); falls back to `"ok"`
 * when no ref-status line surfaces. The audit entry's `refStatus` field
 * is forensic, not load-bearing — coarse capture beats brittle parsing.
 */
function parseRefStatus(stderr: string): string {
  for (const line of stderr.split("\n")) {
    if (line.includes("->") && /^\s/.test(line)) {
      return line.trim();
    }
  }
  return "ok";
}

/**
 * Best-effort hook attribution for a non-zero `git push` exit. Pre-push
 * hook output identifies via "pre-push" substrings; server-side rejects
 * (non-fast-forward, remote rejected, branch policy) identify via the
 * "rejected" / "non-fast-forward" / "remote rejected" patterns. Returns
 * `"unknown"` when no marker surfaces — the audit shape is preserved
 * either way.
 */
function detectPushHook(output: string): string {
  if (output.includes("pre-push")) return "pre-push";
  if (
    output.includes("non-fast-forward")
    || output.includes("remote rejected")
    || output.includes("[rejected]")
    || output.includes(" rejected ")
  ) return "server";
  return "unknown";
}

/**
 * Filter pushability conditions to the refusal-causing subset: anything
 * {@link isRefusalCondition} flags (`block` and `caller-resolvable`) plus the
 * `force-push-required` advisory (always-refuse contract from
 * `pushability.ts`). `auto-fixed` and other `advisory` dispositions pass
 * through — the matrix already resolved them or surfaces them for caller
 * judgment.
 */
function filterRefusalConditions(
  conditions: readonly PushabilityCondition[],
): PushabilityCondition[] {
  return conditions.filter((c) =>
    isRefusalCondition(c) || c.kind === "force-push-required",
  );
}

interface RefuseContext {
  wu: AuditWorkUnit | null;
  deps: ReleasePushDeps;
  writeStderr: (msg: string) => void;
  appendAudit: AppendAudit;
}

async function refuse(
  decision: Extract<AuthorizationDecision, { kind: "refuse" }>,
  ctx: RefuseContext,
): Promise<ReleasePushResult> {
  ctx.writeStderr(`${formatRefusal(decision)}\n`);

  const entry = buildAuditEntry({
    deps: ctx.deps,
    wu: ctx.wu,
    decision: "refused",
    refusalCode: decision.code,
    outcome: { kind: "refused" },
  });
  const auditResult = await ctx.appendAudit({ cwd: ctx.deps.cwd, identity: ctx.deps.identity, entry });
  surfaceAuditFailure(auditResult, ctx.writeStderr);

  return { exitCode: decision.code };
}

interface BuildEntryOptions {
  deps: ReleasePushDeps;
  wu: AuditWorkUnit | null;
  decision: "proceeded" | "refused";
  refusalCode: RefusalCode | null;
  outcome: AuditOutcome;
}

function buildAuditEntry(opts: BuildEntryOptions): AuditEntry {
  const interlockState: AuditInterlockState = {
    command: "release-push",
    pushInterlock: opts.deps.settings.resolved.pushInterlock,
    syncInterlock: opts.deps.settings.resolved.syncInterlock,
  };
  return {
    schemaVersion: 2,
    timestamp: new Date().toISOString(),
    command: "release-push",
    args: sanitizeArgs("release-push", opts.deps.argv),
    wu: opts.wu,
    interlockState,
    decision: opts.decision,
    refusalCode: opts.refusalCode,
    outcome: opts.outcome,
  };
}
