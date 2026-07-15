/**
 * `arc release commit` handler — orchestrator for refusal and success paths.
 *
 * Composes the destructive-flag detector, active-WU resolver, and
 * `authorizeRelease` interlock check into a short-circuit cascade
 * (12 → 10 → 13 → 11): cheapest checks fire first to minimize I/O on
 * common refusal paths. Each refusal exits with the matched refusal
 * code, prints a `formatRefusal()` message, and writes a
 * `decision: "refused"` audit entry. The wrapped `git commit`
 * subprocess never fires on a refusal path.
 *
 * On authorization, the wrapped-git invocation runs via the injected
 * `spawnGit`. Exit code 0 resolves HEAD via `resolveHead` and writes a
 * `proceeded` / `outcome.kind: "commit"` audit entry. Non-zero attributes
 * a hook from the captured stdout/stderr (best-effort substring match;
 * defaults to `"unknown"`) and writes `proceeded` / `outcome.kind:
 * "hook-failed"`. Git's exit code is bubbled verbatim either way.
 *
 * **Settings resolution.** Callers pass a pre-resolved
 * `ResolvedSettingsResult`. Resolving once at the handler boundary and
 * threading the result through validation and audit-entry write keeps
 * this orchestrator I/O-narrow (only WU resolution, the wrapped spawn,
 * HEAD resolution, and audit-log write happen here) and prevents drift
 * between read sites.
 *
 * @module
 */

import {
  appendAuditEntry,
  sanitizeArgs,
  toAuditWorkUnit,
} from "../../lib/release/audit-log.js";
import { detectCommitDestructive } from "../../lib/release/destructive-flags.js";
import {
  authorizeRelease,
  formatRefusal,
} from "../../lib/release/interlock-validation.js";
import { resolveActiveWu } from "../../lib/release/wu-resolution.js";
import { rewriteCommitFileSource } from "../../lib/release/commit-message-source.js";
import { renderCommitMessageRetryCommand } from "../../lib/release/commit-message-retry.js";
import type {
  AuditEntry,
  AuditInterlockState,
  AuditOutcome,
  AuditWorkUnit,
  AuthorizationDecision,
  RefusalCode,
} from "../../lib/release/types.js";
import type { ResolvedSettingsResult } from "../../lib/config/resolved-settings.js";

/** Subprocess result shape returned by the wrapped-git invocation. */
export interface SpawnGitResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

export interface SpawnGitOptions {
  args: readonly string[];
  /** Forwarded into the spawned process; defaults to the handler's `cwd`. */
  cwd: string;
  /** Captured stdin for `-F -`; absent means inherit the caller stream. */
  stdin?: Uint8Array;
}

export type SpawnGit = (opts: SpawnGitOptions) => Promise<SpawnGitResult>;

/**
 * Resolves the just-committed HEAD hash post-success. Real impl runs
 * `git rev-parse HEAD`; tests inject a stub. Called only when `spawnGit`
 * resolves with `exitCode: 0`.
 */
export type ResolveHead = (opts: { cwd: string }) => Promise<string>;

/** Result of classifying and validating deterministic commit-message input. */
export type CommitMessagePreflightResult =
  | { kind: "pass-through" }
  | {
      kind: "passed";
      verdict: "pass" | "pass-with-warnings";
      /** Canonical assembled bytes approved by the validator. */
      messageBytes: Uint8Array;
      transport?:
        | { kind: "messages" }
        | {
            kind: "file";
            rawBytes: Uint8Array;
            sourcePath: string;
            sourceIdentity?: string;
          }
        | { kind: "stdin"; rawBytes: Uint8Array };
    }
  | { kind: "refused"; reason: "validation" | "input"; message: string };

/** In-process commit-message preflight boundary. */
export type PreflightCommitMessage = (opts: {
  args: readonly string[];
  cwd: string;
}) => Promise<CommitMessagePreflightResult>;

/** Private snapshot used to hand captured file bytes to Git exactly once. */
export interface CommitMessageSnapshot {
  path: string;
  cleanup: () => Promise<void>;
}

export type CreateCommitMessageSnapshot = (opts: {
  cwd: string;
  bytes: Uint8Array;
}) => Promise<CommitMessageSnapshot>;

/** Persist the latest approved retry message beneath the active worktree Git dir. */
export type PersistCommitMessageRetry = (opts: {
  cwd: string;
  bytes: Uint8Array;
}) => Promise<{ path: string }>;

/** Remove a successfully consumed wrapper-owned retry source when its generation still matches. */
export type CleanupConsumedMessageRetry = (opts: {
  cwd: string;
  sourcePath: string;
  sourceIdentity: string;
}) => Promise<boolean>;

/**
 * Audit-entry writer signature. Defaulted to {@link appendAuditEntry}; tests
 * inject a custom writer (or rely on the default and read the JSONL after
 * the fact).
 */
export type AppendAudit = (opts: {
  cwd: string;
  identity: string;
  entry: AuditEntry;
}) => Promise<{ ok: true } | { ok: false; error: Error }>;

export interface ReleaseCommitDeps {
  cwd: string;
  identity: string;
  argv: readonly string[];
  settings: ResolvedSettingsResult;
  currentBranch: string;
  /**
   * Wrapped `git commit` invocation. Called only when the cascade
   * authorizes the operation; the refusal cascade never calls this.
   */
  spawnGit: SpawnGit;
  /**
   * HEAD resolver invoked post-success to capture the committed hash for
   * the audit entry. Called only on `spawnGit` exit code 0.
   */
  resolveHead: ResolveHead;
  /** Classifies and validates deterministic message input after authorization. */
  preflightCommitMessage: PreflightCommitMessage;
  /** Creates a private worktree-Git-dir snapshot for captured file sources. */
  createMessageSnapshot: CreateCommitMessageSnapshot;
  /** Atomically replaces the worktree-local latest approved retry message. */
  persistMessageRetry: PersistCommitMessageRetry;
  /** Removes the exact wrapper-owned retry file after successful consumption. */
  cleanupConsumedMessageRetry: CleanupConsumedMessageRetry;
  /** Wrapper-only safe prepared-file resubmission guidance. */
  preflightRemedy: string;
  /** Sink for refusal messages. Defaults to `process.stderr.write`. */
  writeStderr?: (msg: string) => void;
  /** Audit-entry writer. Defaults to {@link appendAuditEntry}. */
  appendAudit?: AppendAudit;
}

export interface ReleaseCommitResult {
  exitCode: number;
}

/**
 * Run the release-commit cascade and return the resulting exit code.
 * Refusal paths emit a refusal message via `writeStderr`, persist an
 * audit entry, and return the matched refusal code. The authorization
 * branch invokes `spawnGit`, writes a `commit` or `hook-failed` audit
 * entry from the result, and bubbles git's exit code verbatim.
 */
export async function runReleaseCommit(
  deps: ReleaseCommitDeps,
): Promise<ReleaseCommitResult> {
  const writeStderr = deps.writeStderr ?? ((msg) => { process.stderr.write(msg); });
  const appendAudit = deps.appendAudit ?? appendAuditEntry;

  // Step 1 (no I/O): destructive flag in argv.
  const flag = detectCommitDestructive(deps.argv);
  if (flag !== null) {
    return refuse(
      { kind: "refuse", code: 12, identifier: "destructive-flag", flag },
      { wu: null, deps, writeStderr, appendAudit },
    );
  }

  // Step 2 (fs probe): resolve active WU. A zero-candidate (`none`) result is
  // accepted — ceremony invocations legitimately run with no active WU, and the
  // remaining gates (branch-protection, interlock) bound the real risks — so only
  // multi-candidate ambiguity refuses (code 10).
  const wu = await resolveActiveWu({ cwd: deps.cwd });
  if (wu.status === "ambiguous") {
    return refuse(
      { kind: "refuse", code: 10, identifier: "ambiguous-active-wu", hint: wu.hint },
      { wu: null, deps, writeStderr, appendAudit },
    );
  }

  // Steps 3 + 4: branch-protection (13) and interlock (11) — settings + branch
  // resolution happens upstream. `authorizeRelease` enforces 13-before-11.
  const decision = authorizeRelease({
    operation: "commit",
    settings: deps.settings,
    currentBranch: deps.currentBranch,
  });

  // `none` (zero-candidate) records a null work unit; `resolved` carries its name.
  const wuAudit = wu.status === "resolved" ? toAuditWorkUnit(wu) : null;

  if (decision.kind === "refuse") {
    return refuse(decision, { wu: wuAudit, deps, writeStderr, appendAudit });
  }

  const preflight = await deps.preflightCommitMessage({ args: deps.argv, cwd: deps.cwd });
  if (preflight.kind === "refused") {
    return refusePreflight(preflight.reason, preflight.message, {
      deps, wu: wuAudit, writeStderr, appendAudit,
    });
  }

  // Authorize: run wrapped `git commit`, attribute the outcome, audit, exit.
  let spawnArgs = deps.argv;
  let spawnStdin: Uint8Array | undefined;
  let snapshot: CommitMessageSnapshot | undefined;
  if (preflight.kind === "passed" && preflight.transport?.kind === "file") {
    try {
      snapshot = await deps.createMessageSnapshot({ cwd: deps.cwd, bytes: preflight.transport.rawBytes });
      spawnArgs = rewriteCommitFileSource(deps.argv, snapshot.path);
    } catch (cause: unknown) {
      const detail = cause instanceof Error ? cause.message : String(cause);
      return refusePreflight("input", `Could not create commit-message snapshot: ${detail}`, {
        deps, wu: wuAudit, writeStderr, appendAudit,
      });
    }
  } else if (preflight.kind === "passed" && preflight.transport?.kind === "stdin") {
    spawnStdin = preflight.transport.rawBytes;
  }

  let spawned: SpawnGitResult;
  try {
    spawned = await deps.spawnGit({
      args: spawnArgs,
      cwd: deps.cwd,
      ...(spawnStdin === undefined ? {} : { stdin: spawnStdin }),
    });
  } finally {
    if (snapshot !== undefined) {
      try {
        await snapshot.cleanup();
      } catch (cause: unknown) {
        const detail = cause instanceof Error ? cause.message : String(cause);
        writeStderr(`warn: commit-message snapshot cleanup failed: ${detail}\n`);
      }
    }
  }
  if (spawned.exitCode !== 0 && preflight.kind === "passed") {
    try {
      const retry = await deps.persistMessageRetry({ cwd: deps.cwd, bytes: preflight.messageBytes });
      writeStderr(`Retry the approved message with:\n${renderCommitMessageRetryCommand(retry.path)}\n`);
    } catch (cause: unknown) {
      const detail = cause instanceof Error ? cause.message : String(cause);
      writeStderr(`warn: latest commit-message retry could not be persisted: ${detail}\n`);
    }
  }
  if (
    spawned.exitCode === 0
    && preflight.kind === "passed"
    && preflight.transport?.kind === "file"
    && preflight.transport.sourceIdentity !== undefined
  ) {
    try {
      await deps.cleanupConsumedMessageRetry({
        cwd: deps.cwd,
        sourcePath: preflight.transport.sourcePath,
        sourceIdentity: preflight.transport.sourceIdentity,
      });
    } catch (cause: unknown) {
      const detail = cause instanceof Error ? cause.message : String(cause);
      writeStderr(`warn: consumed commit-message retry could not be removed: ${detail}\n`);
    }
  }
  const outcome: AuditOutcome = spawned.exitCode === 0
    ? { kind: "commit", hash: await safeResolveHead(deps, writeStderr) }
    : {
        kind: "hook-failed",
        hook: detectCommitHook(`${spawned.stdout}\n${spawned.stderr}`),
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

  return { exitCode: spawned.exitCode };
}

async function refusePreflight(
  reason: "validation" | "input",
  message: string,
  ctx: RefuseContext,
): Promise<ReleaseCommitResult> {
  const refusal: Extract<AuthorizationDecision, { code: 16 }> = {
    kind: "refuse",
    code: 16,
    identifier: "commit-message-preflight-failed",
    reason,
  };
  ctx.writeStderr(`${message}\n${formatRefusal(refusal)}\n${ctx.deps.preflightRemedy}\n`);
  const auditResult = await ctx.appendAudit({
    cwd: ctx.deps.cwd,
    identity: ctx.deps.identity,
    entry: buildAuditEntry({
      deps: ctx.deps,
      wu: ctx.wu,
      decision: "refused",
      refusalCode: 16,
      outcome: { kind: "preflight-failed", reason },
    }),
  });
  surfaceAuditFailure(auditResult, ctx.writeStderr);
  return { exitCode: 16 };
}

/**
 * Resolve HEAD post-success, surfacing executor failure to stderr without
 * propagating. A throw here would mask a successful `git commit` and skip
 * the audit-emit path; capturing the failure as `"unknown"` keeps the audit
 * shape and exit code aligned with what git actually did.
 */
async function safeResolveHead(
  deps: ReleaseCommitDeps,
  writeStderr: (msg: string) => void,
): Promise<string> {
  try {
    return await deps.resolveHead({ cwd: deps.cwd });
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    writeStderr(`warn: HEAD resolution failed; audit hash recorded as "unknown" (${detail})\n`);
    return "unknown";
  }
}

/**
 * Surface a failed audit-write to stderr without propagating. Audit logging
 * is sidecar to the wrapper outcome — a write failure shouldn't mask a
 * successful commit, but it must be visible so the operator can investigate
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
 * Best-effort hook attribution for a non-zero `git commit` exit. Pattern-matches
 * captured output for known commit-side hook names. Order matters: longer names
 * checked first to avoid `commit-msg` swallowing `prepare-commit-msg`. Returns
 * `"unknown"` when no hook keyword surfaces — the audit shape is preserved
 * either way.
 */
function detectCommitHook(output: string): string {
  if (output.includes("prepare-commit-msg")) return "prepare-commit-msg";
  if (output.includes("commit-msg")) return "commit-msg";
  if (output.includes("pre-commit")) return "pre-commit";
  return "unknown";
}

interface RefuseContext {
  wu: AuditWorkUnit | null;
  deps: ReleaseCommitDeps;
  writeStderr: (msg: string) => void;
  appendAudit: AppendAudit;
}

async function refuse(
  decision: Extract<AuthorizationDecision, { kind: "refuse" }>,
  ctx: RefuseContext,
): Promise<ReleaseCommitResult> {
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
  deps: ReleaseCommitDeps;
  wu: AuditWorkUnit | null;
  decision: "proceeded" | "refused";
  refusalCode: RefusalCode | null;
  outcome: AuditOutcome;
}

function buildAuditEntry(opts: BuildEntryOptions): AuditEntry {
  const interlockState: AuditInterlockState = {
    command: "release-commit",
    commitInterlock: opts.deps.settings.resolved.commitInterlock,
    pushInterlock: opts.deps.settings.resolved.pushInterlock,
  };
  return {
    schemaVersion: 2,
    timestamp: new Date().toISOString(),
    command: "release-commit",
    args: sanitizeArgs("release-commit", opts.deps.argv),
    wu: opts.wu,
    interlockState,
    decision: opts.decision,
    refusalCode: opts.refusalCode,
    outcome: opts.outcome,
  };
}
