/**
 * Interlock-state validation + authorization decision for the release-wrapper
 * commands (`arc release commit` / `arc release push`).
 *
 * **Defensive validation, not policy enforcement.** The release wrapper is
 * the agent's path to bypass the harness prompt; the user-facing model is
 * "agent uses wrapper to bypass prompt, or uses raw git which the harness
 * prompts on." Code 11 (`interlock-not-authorized`) fires only when the
 * agent invokes the wrapper outside the configured scope — a defensive
 * backstop against agent confusion. In normal use, the agent's contract
 * handles tool selection; code 11 should not fire.
 *
 * **Authorization rule.** Each wrapper command has a fixed scope; the
 * wrapper authorizes when configured permission overlaps the scope.
 *
 * - `arc release commit` scope: any commit the agent fires (task-work ∪
 *   ceremony). Authorized when `commit_interlock` is `on-task-approval`
 *   (covers task-work) or `on-workflow` (covers all). Refused on `manual`
 *   (zero scope).
 * - `arc release push` scope: ceremony push only (sync uses its own internal
 *   helper). Authorized when `push_interlock` is `on-workflow`. Refused on
 *   `manual` (zero scope) or `on-sync` (sync ⊄ ceremony).
 *
 * **Branch-protection check.** Independent of interlock; under
 * `branch.protection: full`, both commit and push refuse on direct ops
 * against the configured `branch.base`. Under `partial` (the default), no
 * refusal regardless of branch.
 *
 * **Composition.** Caller resolves settings once via `resolveAllSettings`
 * and passes the result in; this module is pure logic with no I/O. The
 * shared `formatRefusal()` composer produces a three-line refusal message
 * (identifier line + what-happened + remediation) consumed across the
 * commit / push handlers and the sync audit-log retrofit.
 *
 * @module
 */

import type { ResolvedSettingsResult } from "../config/resolved-settings.js";
import type { AuthorizationDecision, FormatRefusal } from "./types.js";

/** Release-wrapper operation kind. */
export type ReleaseOperation = "commit" | "push";

export interface AuthorizeReleaseOptions {
  operation: ReleaseOperation;
  /** Resolved settings produced by `resolveAllSettings` — single I/O round-trip. */
  settings: ResolvedSettingsResult;
  /** Current git branch name. Read by the caller (cheap; one git invocation). */
  currentBranch: string;
}

/**
 * Apply branch-protection and interlock checks against the resolved
 * configuration. Returns an `authorize` decision when both gates pass; a
 * `refuse` decision keyed by code (13 for branch-protection, 11 for
 * interlock) otherwise. Branch-protection short-circuits before the
 * interlock check.
 */
export function authorizeRelease(opts: AuthorizeReleaseOptions): AuthorizationDecision {
  const branchProtectionDecision = checkBranchProtection(opts);
  if (branchProtectionDecision !== null) return branchProtectionDecision;

  return checkInterlock(opts);
}

function checkBranchProtection(opts: AuthorizeReleaseOptions): AuthorizationDecision | null {
  if (opts.settings.settings["branch.protection"] !== "full") return null;
  if (opts.currentBranch !== opts.settings.settings["branch.base"]) return null;
  return {
    kind: "refuse",
    code: 13,
    identifier: "branch-protection-violation",
    branch: opts.currentBranch,
  };
}

function checkInterlock(opts: AuthorizeReleaseOptions): AuthorizationDecision {
  if (opts.operation === "commit") {
    const value = opts.settings.resolved.commitInterlock.value;
    if (value === "on-task-approval" || value === "on-workflow") {
      return { kind: "authorize" };
    }
    return {
      kind: "refuse",
      code: 11,
      identifier: "interlock-not-authorized",
      setting: { key: "session.commit_interlock", value },
    };
  }

  // operation === "push"
  const value = opts.settings.resolved.pushInterlock.value;
  if (value === "on-workflow") {
    return { kind: "authorize" };
  }
  return {
    kind: "refuse",
    code: 11,
    identifier: "interlock-not-authorized",
    setting: { key: "session.push_interlock", value },
  };
}

// --- Refusal message composer ---

/**
 * Three-line refusal message: identifier line, what-happened sentence,
 * remediation hint. Single source of truth for refusal-message format
 * across the release handlers and the sync audit-log retrofit. Code 11
 * remediation follows the prompt-vs-bypass framing — raw `git` first
 * (the harness-prompt path), config escalation second.
 */
export const formatRefusal: FormatRefusal = (decision) => {
  if (decision.kind === "authorize") {
    // Authorize is not a refusal; preserved here for total-function shape.
    // Callers that reach this branch likely have a logic error.
    return "";
  }

  const header = `Refused: ${decision.identifier} (code ${String(decision.code)})`;
  const [whatHappened, remediation] = composeBody(decision);
  return `${header}\n${whatHappened}\n${remediation}`;
};

function composeBody(
  decision: Exclude<AuthorizationDecision, { kind: "authorize" }>,
): [string, string] {
  switch (decision.code) {
    case 10: {
      const what = decision.hint ?? "No active work unit resolved in `.arc/active/`.";
      return [
        what,
        "Activate a work unit before retrying, or run session-init to disambiguate.",
      ];
    }
    case 11: {
      const op = decision.setting.key === "session.commit_interlock" ? "commit" : "push";
      return [
        `\`${decision.setting.key}\` is set to \`${decision.setting.value}\`; this ${op} is outside the authorized scope.`,
        composeInterlockRemediation(decision.setting.key, op),
      ];
    }
    case 12:
      return [
        `Argv contained \`${decision.flag}\`, which \`arc release\` refuses.`,
        "Use raw `git` for this operation.",
      ];
    case 13:
      return [
        `Operation targets \`${decision.branch}\`, which is the protected base under \`branch.protection: full\`.`,
        "Switch to a feature branch.",
      ];
    case 14: {
      const kinds = decision.conditions.map((c) => `\`${c.kind}\``).join(", ");
      return [
        `Push pre-check returned: ${kinds}.`,
        "Resolve the conditions above and retry, or use raw `git push`.",
      ];
    }
    case 15:
      return [
        "Invocation shape did not match release-wrapper grammar.",
        "Use raw `git` for this operation.",
      ];
  }
}

function composeInterlockRemediation(
  key: "session.commit_interlock" | "session.push_interlock",
  op: ReleaseOperation,
): string {
  if (key === "session.commit_interlock") {
    return `Use raw \`git ${op}\` instead. Or set \`${key}\` to \`on-task-approval\` or \`on-workflow\` to authorize.`;
  }
  return `Use raw \`git ${op}\` instead. Or set \`${key}: on-workflow\` to authorize.`;
}
