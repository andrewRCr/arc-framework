/**
 * Public type surface for the release-wrapper validation library.
 *
 * Pins the refusal taxonomy, authorization-decision shape, audit-entry
 * schema, and shared refusal-formatter signature consumed by the release
 * commit/push handlers and the sync audit-log retrofit. Importing from
 * this module gives callers the single source of truth for the names and
 * shapes — internal modules are not reached into directly.
 *
 * Type declarations only; no runtime. Compiler-validated.
 *
 * @module
 */

import type {
  CommitInterlock,
  PushInterlock,
  SyncInterlock,
  NotesPushPolicy,
} from "../config/resolved-settings.js";
import type { ResolvedConfigOverride } from "../config/resolve-override.js";
import type { PushabilityCondition } from "../git/index.js";

// --- Refusal taxonomy ---

/**
 * Numeric exit code emitted on refusal. Stable surface: test suites,
 * harness gates, and downstream tooling match on these values.
 *
 * Code 15 (`arg-grammar-fallthrough`) is runtime-emitted by `arc release
 * push` when positional `<remote> <branch>` arguments do not match the
 * wrapper's fixed target (`origin <current-branch>`). The detail payload
 * carries the attempted and expected refs so the refusal message can name
 * both. Arg-grammar issues outside this narrow check still fall through to
 * git's parser; the code's name preserves the broader category for future
 * detections.
 */
export type RefusalCode = 10 | 11 | 12 | 13 | 14 | 15;

/** Stable string identifier for each refusal code. Pairs 1-to-1 with `RefusalCode`. */
export type RefusalIdentifier =
  | "no-active-wu"
  | "interlock-not-authorized"
  | "destructive-flag"
  | "branch-protection-violation"
  | "pushability-precheck-failed"
  | "arg-grammar-fallthrough";

/**
 * Mapping from `RefusalCode` to `RefusalIdentifier`. Single source of
 * truth for the code-to-identifier pairing — consumers reference this
 * rather than hardcoding pairs at each call site.
 */
export const REFUSAL_IDENTIFIERS: Readonly<Record<RefusalCode, RefusalIdentifier>> = {
  10: "no-active-wu",
  11: "interlock-not-authorized",
  12: "destructive-flag",
  13: "branch-protection-violation",
  14: "pushability-precheck-failed",
  15: "arg-grammar-fallthrough",
};

// --- Authorization decision ---

/**
 * Per-code discriminated payload returned by interlock-validation logic.
 * `authorize` forks to the wrapped git invocation; `refuse` forks to
 * refusal formatting and an audit-log entry.
 *
 * Code 11 carries the offending interlock setting (key + resolved value) so
 * `formatRefusal()` can compose specific remediation text without re-deriving
 * from caller context. The setting is keyed by the per-developer git-config
 * key, paired with the value-typed resolved value.
 */
export type AuthorizationDecision =
  | { kind: "authorize" }
  | { kind: "refuse"; code: 10; identifier: "no-active-wu"; hint?: string }
  | {
      kind: "refuse";
      code: 11;
      identifier: "interlock-not-authorized";
      setting:
        | { key: "arc.commitInterlock"; value: CommitInterlock }
        | { key: "arc.pushInterlock"; value: PushInterlock };
    }
  | { kind: "refuse"; code: 12; identifier: "destructive-flag"; flag: string }
  | { kind: "refuse"; code: 13; identifier: "branch-protection-violation"; branch: string }
  | {
      kind: "refuse";
      code: 14;
      identifier: "pushability-precheck-failed";
      conditions: PushabilityCondition[];
    }
  | {
      kind: "refuse";
      code: 15;
      identifier: "arg-grammar-fallthrough";
      detail?: {
        reason: "positional-ref-mismatch";
        attempted: { remote: string; branch: string };
        expected: { remote: string; branch: string };
      };
    };

// --- Audit entry ---

/** Audit-log JSONL command discriminator. */
export type AuditCommand = "release-commit" | "release-push" | "sync";

/**
 * Per-command interlock-state snapshot. Keyed by the entry's top-level
 * `command` field; schema enforcement at write time refuses entries
 * whose shape doesn't match the discriminator.
 */
export type AuditInterlockState =
  | {
      command: "release-commit";
      commitInterlock: ResolvedConfigOverride<CommitInterlock>;
      pushInterlock: ResolvedConfigOverride<PushInterlock>;
    }
  | {
      command: "release-push";
      pushInterlock: ResolvedConfigOverride<PushInterlock>;
      syncInterlock: ResolvedConfigOverride<SyncInterlock>;
    }
  | {
      command: "sync";
      pushInterlock: ResolvedConfigOverride<PushInterlock>;
      notesPush: ResolvedConfigOverride<NotesPushPolicy>;
      syncInterlock: ResolvedConfigOverride<SyncInterlock>;
    };

/**
 * Audit-log outcome shape. Discriminated by `kind`: per-command success
 * outcomes (`commit`, `push`, `sync`), shared `hook-failed` for hook
 * rejection, shared `refused` for authorization refusal.
 */
export type AuditOutcome =
  | { kind: "commit"; hash: string }
  | { kind: "push"; refStatus: string }
  | {
      kind: "sync";
      cell: string;
      worktree: string;
      notes: string;
      exitCode: number;
    }
  | { kind: "hook-failed"; hook: string; exitCode: number }
  | { kind: "refused" };

/**
 * Active-WU pointer captured in the audit entry. Null when no WU
 * resolved (refusal before resolution, or a layout that lacks a parseable
 * name — e.g., today's lite-layout `active/status.md`).
 */
export interface AuditWorkUnit {
  /** WU name parsed from the meta filename — `meta-{name}.md`. */
  name: string;
}

/**
 * One audit-log entry (one JSONL line). Schema v1 — append-only,
 * gitignored, per-identity at
 * `.arc/user/{identity}/.internal/.audit-log.jsonl`.
 */
export interface AuditEntry {
  schemaVersion: 1;
  /** ISO 8601, produced via `new Date().toISOString()`. */
  timestamp: string;
  command: AuditCommand;
  /** Sanitized argv (post-`sanitizeArgs`). */
  args: string[];
  wu: AuditWorkUnit | null;
  interlockState: AuditInterlockState;
  decision: "proceeded" | "refused";
  /** Populated on `refused`; null on `proceeded`. */
  refusalCode: RefusalCode | null;
  outcome: AuditOutcome;
}

// --- Refusal-message helper signature ---

/**
 * Compose a refusal message from an authorization decision: identifier
 * line, what-happened sentence, remediation hint. Single source of truth
 * for refusal-message format across the commit and push handlers and the
 * sync audit-log retrofit.
 *
 * Implementation lives in `interlock-validation.ts`; the type alias is
 * pinned here so handlers import the same callable shape.
 */
export type FormatRefusal = (decision: AuthorizationDecision) => string;
