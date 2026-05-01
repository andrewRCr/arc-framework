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
import type { DirtyStateResult } from "../../lib/git/dirty-state.js";
import type { HeadHashResult } from "../../lib/git/head-hash.js";
import type { WorktreeSyncStatusResult } from "../../lib/git/worktree-sync.js";
import type { ResolvedSyncPush } from "../../lib/sync-policy.js";

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

/**
 * Push-interlock slot in the session-handoff envelope — narrow projection of
 * `ConfigSessionInitResult.settings["session.push_interlock"]`. Distinct shape
 * so the handoff envelope doesn't leak unrelated session-init settings.
 */
export interface HandoffPushInterlock {
  value: "manual" | "on-handoff";
  source: "yaml" | "default";
}

/**
 * Session-handoff composite result — `--session-handoff` consumer shape.
 *
 * Self-contained: arc-handoff is skill-invoked and shouldn't depend on
 * session-init context still being intact. Seven slots: dirty-state probe,
 * worktree sync, notes sync (user), push interlock with provenance, the
 * handoff-interior toggle set (`syncPush` today; future toggles named as
 * sibling slots), the resolved active status file, and current HEAD
 * short-hash for the `Commit at Handoff` anchor.
 */
export interface SessionHandoffResult {
  mode: "session-handoff";
  identity: StatusIdentity;
  dirty: Probe<DirtyStateResult>;
  worktree: Probe<WorktreeSyncStatusResult>;
  user: Probe<UserSessionInitStatusResult>;
  pushInterlock: Probe<HandoffPushInterlock>;
  syncPush: Probe<ResolvedSyncPush>;
  active: Probe<ActiveSessionInitResult>;
  head: Probe<HeadHashResult>;
}

/** Probe functions in session-init mode — bound to cwd and any required I/O. */
export interface SessionInitProbes {
  user: (identity: string) => Promise<UserSessionInitStatusResult>;
  worktree: () => Promise<WorktreeSyncStatusResult>;
  extensions: () => Promise<ExtensionsSessionInitResult>;
  config: () => Promise<ConfigSessionInitResult>;
  /**
   * Active probe receives `identity` and `role` so contributor flow can
   * scan `.arc/user/{identity}/active/` instead of the maintainer root.
   * Both pointers are forwarded verbatim from the composite — `null` means
   * the corresponding `git config` key was absent.
   */
  active: (
    identity: string | null,
    role: string | null,
  ) => Promise<ActiveSessionInitResult>;
  domainRules: () => Promise<DomainRulesSessionInitResult>;
}

/** Probe functions in session-handoff mode — bound to cwd and any required I/O. */
export interface SessionHandoffProbes {
  dirty: () => Promise<DirtyStateResult>;
  worktree: () => Promise<WorktreeSyncStatusResult>;
  user: (identity: string) => Promise<UserSessionInitStatusResult>;
  pushInterlock: () => Promise<HandoffPushInterlock>;
  syncPush: () => Promise<ResolvedSyncPush>;
  active: (
    identity: string | null,
    role: string | null,
  ) => Promise<ActiveSessionInitResult>;
  head: () => Promise<HeadHashResult>;
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

export interface RunSessionHandoffStatusOptions {
  identity: string | null;
  role: string | null;
  probes: SessionHandoffProbes;
}
