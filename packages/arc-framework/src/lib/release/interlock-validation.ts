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
import type { ConfigSettings } from "../../commands/config/types.js";
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

/**
 * Branch-protection predicate: `true` when `branch.protection` is `full` and
 * the given branch is the configured `branch.base`. The shared rule behind both
 * the release-wrapper branch-protection gate ({@link checkBranchProtection}) and
 * the cold-start protected-branch guard — direct work on the protected base is
 * refused under `full`; `partial` (the default) protects nothing.
 *
 * @param settings - Resolved config settings carrying `branch.protection` / `branch.base`.
 * @param branch - The branch to test against the protected base.
 * @returns `true` when the branch is the protected base under full protection.
 */
export function isProtectedBranch(settings: ConfigSettings, branch: string): boolean {
  return settings["branch.protection"] === "full" && branch === settings["branch.base"];
}

/**
 * Branch-protection gate. Returns the code 13 refusal when
 * `branch.protection: full` and the current branch matches the configured
 * base; null otherwise. Exported so the push cascade can sequence branch
 * protection (13) → pushability (14) → interlock (11) without re-deriving
 * the check inline. Return type narrows to the code 13 arm so callers
 * forward the result without re-narrowing the discriminator.
 */
export function checkBranchProtection(
  opts: AuthorizeReleaseOptions,
): Extract<AuthorizationDecision, { code: 13 }> | null {
  if (!isProtectedBranch(opts.settings.settings, opts.currentBranch)) return null;
  return {
    kind: "refuse",
    code: 13,
    identifier: "branch-protection-violation",
    branch: opts.currentBranch,
  };
}

/**
 * Interlock gate. Returns an `authorize` decision when the configured
 * interlock value covers the wrapper's scope; otherwise a code 11 refusal
 * carrying the offending setting key + value. Exported so the push cascade
 * can defer this check until after pushability (14).
 */
export function checkInterlock(opts: AuthorizeReleaseOptions): AuthorizationDecision {
  if (opts.operation === "commit") {
    const value = opts.settings.resolved.commitInterlock.value;
    if (value === "on-task-approval" || value === "on-workflow") {
      return { kind: "authorize" };
    }
    return {
      kind: "refuse",
      code: 11,
      identifier: "interlock-not-authorized",
      setting: { key: "arc.commitInterlock", value },
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
    setting: { key: "arc.pushInterlock", value },
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
      const op = decision.setting.key === "arc.commitInterlock" ? "commit" : "push";
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
    case 15: {
      if (decision.detail?.reason === "positional-ref-mismatch") {
        const { attempted, expected } = decision.detail;
        return [
          `Positional push target \`${attempted.remote} ${attempted.branch}\` does not match the wrapper's target \`${expected.remote} ${expected.branch}\`.`,
          "Drop the positional pair (the wrapper supplies it), or use raw `git push` to target a different ref.",
        ];
      }
      return [
        "Invocation shape did not match release-wrapper grammar.",
        "Use raw `git` for this operation.",
      ];
    }
  }
}

function composeInterlockRemediation(
  key: "arc.commitInterlock" | "arc.pushInterlock",
  op: ReleaseOperation,
): string {
  if (key === "arc.commitInterlock") {
    return `Use raw \`git ${op}\` instead. Or run \`git config --local ${key} on-task-approval\` (or \`on-workflow\`) to authorize.`;
  }
  return `Use raw \`git ${op}\` instead. Or run \`git config --local ${key} on-workflow\` to authorize.`;
}
