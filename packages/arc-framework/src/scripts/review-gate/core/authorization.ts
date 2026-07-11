/** Capability and identity scoping for review commands and overrides. */

import type { ActorPermission, CapabilitySet } from "./contracts.js";
import type { ReviewCommand } from "./commands.js";

/** Identities that scope every command mutation. */
export interface ReviewScopeIdentity {
  changeSetId: string;
  policyVersion: string;
  rubricVersion: string;
}

/** Auditable authorized command receipt. */
export interface AuthorizedCommandReceipt extends ReviewScopeIdentity {
  command: ReviewCommand;
  actorIdentity: string;
  permission: ActorPermission;
  reason: string;
}

/** Authorization inputs after live capability resolution. */
export interface AuthorizeReviewCommandInput {
  command: ReviewCommand;
  capabilities: CapabilitySet;
  currentScope: ReviewScopeIdentity;
  expectedScope: ReviewScopeIdentity;
}

/** Authorization verdict. */
export type CommandAuthorizationResult =
  | { authorized: true; receipt: AuthorizedCommandReceipt }
  | { authorized: false; reason: string };

const PERMISSION_RANK: Record<ActorPermission, number> = {
  read: 0,
  triage: 1,
  write: 2,
  maintain: 3,
  admin: 4,
};

function sameScope(left: ReviewScopeIdentity, right: ReviewScopeIdentity): boolean {
  return left.changeSetId === right.changeSetId
    && left.policyVersion === right.policyVersion
    && left.rubricVersion === right.rubricVersion;
}

/** Authorize a scoped command against freshly resolved capabilities. */
export function authorizeReviewCommand(input: AuthorizeReviewCommandInput): CommandAuthorizationResult {
  if (!sameScope(input.currentScope, input.expectedScope)) return { authorized: false, reason: "stale-scope" };
  const minimum: ActorPermission = input.command.kind === "require" || input.command.kind === "refresh"
    ? "write"
    : "maintain";
  const permission = [...input.capabilities.permissions]
    .sort((left, right) => PERMISSION_RANK[right] - PERMISSION_RANK[left])
    .find((candidate) => PERMISSION_RANK[candidate] >= PERMISSION_RANK[minimum]);
  if (permission === undefined) return { authorized: false, reason: `requires-${minimum}` };
  return {
    authorized: true,
    receipt: {
      command: input.command,
      actorIdentity: input.capabilities.actorIdentity,
      permission,
      reason: input.command.reason,
      ...input.currentScope,
    },
  };
}

/** Check whether an override still matches all three scope identities. */
export function overrideIsCurrent(
  receipt: AuthorizedCommandReceipt,
  currentScope: ReviewScopeIdentity,
): boolean {
  return sameScope(receipt, currentScope);
}
