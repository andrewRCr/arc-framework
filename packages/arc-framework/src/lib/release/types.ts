/**
 * Public type surface for the release-wrapper validation library.
 *
 * Pins the refusal taxonomy, authorization-decision shape, and shared
 * refusal-formatter signature consumed by the release commit/push handlers.
 * Audit-entry contracts are owned by `schema.ts`.
 *
 * Type declarations only; no runtime. Compiler-validated.
 *
 * @module
 */

import type {
  CommitInterlock,
  PushInterlock,
} from "../config/resolved-settings.js";
import type { PushabilityCondition } from "../git/index.js";
import type { RefusalCode } from "./schema.js";

// --- Refusal taxonomy ---

/** Stable string identifier for each refusal code. Pairs 1-to-1 with `RefusalCode`. */
export type RefusalIdentifier =
  | "ambiguous-active-wu"
  | "interlock-not-authorized"
  | "destructive-flag"
  | "branch-protection-violation"
  | "pushability-precheck-failed"
  | "arg-grammar-fallthrough"
  | "commit-message-preflight-failed";

/**
 * Mapping from `RefusalCode` to `RefusalIdentifier`. Single source of
 * truth for the code-to-identifier pairing — consumers reference this
 * rather than hardcoding pairs at each call site.
 */
export const REFUSAL_IDENTIFIERS: Readonly<Record<RefusalCode, RefusalIdentifier>> = {
  10: "ambiguous-active-wu",
  11: "interlock-not-authorized",
  12: "destructive-flag",
  13: "branch-protection-violation",
  14: "pushability-precheck-failed",
  15: "arg-grammar-fallthrough",
  16: "commit-message-preflight-failed",
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
  | { kind: "refuse"; code: 10; identifier: "ambiguous-active-wu"; hint?: string }
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
    }
  | {
      kind: "refuse";
      code: 16;
      identifier: "commit-message-preflight-failed";
      reason: "validation" | "input";
    };

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
