/**
 * Type contracts for `arc status` — the composite probe orchestrator.
 *
 * The composite fans out to the four standalone probes (user, extensions,
 * config, active) and folds their results into a single envelope. Session-init
 * consumes this in place of its own Batch 1 git-config reads and four separate
 * CLI invocations.
 *
 * Each probe slot is wrapped in a {@link Probe} discriminated union so
 * per-probe failures surface through the result shape rather than process
 * exit — the agent decides what to do with a partial result. Top-level
 * `identity` is populated by direct `git config` reads in the handler,
 * logically parallel to the probe fan-out.
 */
import type {
  ActiveSessionInitResult,
  ActiveStatusResult,
} from "../active/types.js";
import type {
  ConfigSessionInitResult,
  ConfigStatusResult,
} from "../config/types.js";
import type { DomainRulesSessionInitResult } from "../constitution/types.js";
import type {
  ExtensionsSessionInitResult,
  ExtensionsStatusResult,
} from "../extensions/types.js";
import type {
  UserSessionInitStatusResult,
  UserStatusResult,
} from "../user/types.js";
import type { WorktreeSyncStatusResult } from "../../lib/git/worktree-sync.js";

/** Git-config pointers resolved in the composite handler (not a probe). */
export interface StatusIdentity {
  /** `git config arc.identity` value; empty and absent normalize to `null`. */
  identity: string | null;
  /** `git config arc.role` value; empty and absent normalize to `null`. */
  role: string | null;
}

/**
 * Per-probe failure reason.
 *
 * - `identity-missing` — user probe short-circuited because `arc.identity`
 *   was absent. Other probes do not use identity and never emit this kind.
 * - `runtime` — probe threw (e.g., missing extensions directory on a partial
 *   install). `message` is the `Error.message` or stringified value.
 */
export interface ProbeError {
  kind: "identity-missing" | "runtime";
  message: string;
}

/** Discriminated union for a probe slot — success or typed error. */
export type Probe<T> =
  | { ok: true; value: T }
  | { ok: false; error: ProbeError };

/** Full-mode composite result — default (no-flag) rendering. */
export interface StatusResult {
  mode: "full";
  identity: StatusIdentity;
  user: Probe<UserStatusResult>;
  extensions: Probe<ExtensionsStatusResult>;
  config: Probe<ConfigStatusResult>;
  active: Probe<ActiveStatusResult>;
}

/** Session-init-scoped composite result — `--session-init` consumer shape. */
export interface SessionInitProbeResult {
  mode: "session-init";
  identity: StatusIdentity;
  user: Probe<UserSessionInitStatusResult>;
  worktree: Probe<WorktreeSyncStatusResult>;
  extensions: Probe<ExtensionsSessionInitResult>;
  config: Probe<ConfigSessionInitResult>;
  active: Probe<ActiveSessionInitResult>;
  domainRules: Probe<DomainRulesSessionInitResult>;
}

/** Probe functions in full mode — bound to cwd and any required I/O. */
export interface StatusProbes {
  /**
   * User-sync probe. Receives `identity` at call time so the composite can
   * short-circuit the user slot when `arc.identity` is absent without ever
   * invoking this function.
   */
  user: (identity: string) => Promise<UserStatusResult>;
  extensions: () => Promise<ExtensionsStatusResult>;
  config: () => Promise<ConfigStatusResult>;
  active: () => Promise<ActiveStatusResult>;
}

/** Probe functions in session-init mode — bound to cwd and any required I/O. */
export interface SessionInitProbes {
  user: (identity: string) => Promise<UserSessionInitStatusResult>;
  worktree: () => Promise<WorktreeSyncStatusResult>;
  extensions: () => Promise<ExtensionsSessionInitResult>;
  config: () => Promise<ConfigSessionInitResult>;
  active: () => Promise<ActiveSessionInitResult>;
  domainRules: () => Promise<DomainRulesSessionInitResult>;
}

export interface RunStatusOptions {
  identity: string | null;
  role: string | null;
  probes: StatusProbes;
}

export interface RunSessionInitStatusOptions {
  identity: string | null;
  role: string | null;
  probes: SessionInitProbes;
}
