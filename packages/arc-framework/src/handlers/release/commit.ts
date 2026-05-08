/**
 * `arc release commit` handler — refusal-path orchestrator.
 *
 * Composes the destructive-flag detector, active-WU resolver, and
 * `authorizeRelease` interlock check into a short-circuit cascade
 * (12 → 10 → 13 → 11): cheapest checks fire first to minimize I/O on
 * common refusal paths. Each refusal exits with the matched refusal
 * code, prints a `formatRefusal()` message, and writes a
 * `decision: "refused"` audit entry. The wrapped `git commit`
 * subprocess never fires on a refusal path.
 *
 * The authorization branch returns a rejected promise — callers that
 * reach it have a pre-resolved authorize decision but no implementation
 * of the wrapped-git invocation, output passthrough, hash extraction,
 * or success/hook-failed audit-entry write. That work is intentionally
 * left for a follow-up so this module's surface is small and unit-tests
 * exercise only the refusal cascade.
 *
 * **Settings resolution.** Callers pass a pre-resolved
 * `ResolvedSettingsResult`. Resolving once at the handler boundary and
 * threading the result through validation and audit-entry write keeps
 * this orchestrator I/O-narrow (only WU resolution and audit-log write
 * happen here) and prevents drift between read sites.
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
import type {
  AuditEntry,
  AuditInterlockState,
  AuditOutcome,
  AuditWorkUnit,
  AuthorizationDecision,
  RefusalCode,
} from "../../lib/release/types.js";
import type { ResolvedSettingsResult } from "../../lib/config/resolved-settings.js";

/**
 * Subprocess result shape returned by the wrapped-git invocation. The
 * refusal cascade never spawns `git commit`, so this surface is unused
 * by the current orchestrator — declared here to keep the dependency
 * shape stable for the success-path wiring.
 */
export interface SpawnGitResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

export interface SpawnGitOptions {
  args: readonly string[];
  /** Forwarded into the spawned process; defaults to the handler's `cwd`. */
  cwd: string;
}

export type SpawnGit = (opts: SpawnGitOptions) => Promise<SpawnGitResult>;

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
 * branch returns a rejected promise — the wrapped-git invocation is not
 * yet implemented.
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

  // Step 2 (fs probe): resolve active WU.
  const wu = await resolveActiveWu({ cwd: deps.cwd });
  if (wu.status === "refused") {
    return refuse(
      { kind: "refuse", code: 10, identifier: "no-active-wu", hint: wu.hint },
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

  if (decision.kind === "refuse") {
    return refuse(decision, {
      wu: toAuditWorkUnit(wu),
      deps,
      writeStderr,
      appendAudit,
    });
  }

  return Promise.reject(
    new Error("release-commit success path is not yet implemented"),
  );
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
  await ctx.appendAudit({ cwd: ctx.deps.cwd, identity: ctx.deps.identity, entry });

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
    schemaVersion: 1,
    timestamp: new Date().toISOString(),
    command: "release-commit",
    args: sanitizeArgs(opts.deps.argv),
    wu: opts.wu,
    interlockState,
    decision: opts.decision,
    refusalCode: opts.refusalCode,
    outcome: opts.outcome,
  };
}

