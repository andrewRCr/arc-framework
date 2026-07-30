/** Exact full-identity and partial-role authority selection for transient provisioning. */

import type { LocusRoleAuthority } from "./mutation.js";
import type { LocusIdentityV1 } from "./schema/index.js";
import type { ProvisionTransientLocusOptions, ProvisioningProposal } from "./provisioning-types.js";

/** Resolve only an authority generation that exactly matches the allocation proposal. */
export function resolveProvisioningAuthority(
  options: ProvisionTransientLocusOptions,
): LocusRoleAuthority | null {
  if (options.protection === "full") {
    return options.branch !== null
      && options.identity?.protection === "full"
      && identityMatches(options.identity, options.proposal, options.branch)
      ? { kind: "identity", identity: options.identity }
      : null;
  }
  if (options.proposal.allocation.kind === "spawn") return null;
  if (options.identity !== null) {
    return options.identity.protection === "partial"
      && identityMatches(options.identity, options.proposal, options.branch)
      ? { kind: "identity", identity: options.identity }
      : null;
  }
  return options.authority !== undefined && partialAuthorityMatches(options.authority, options.proposal)
    ? options.authority
    : null;
}

function identityMatches(
  identity: LocusIdentityV1,
  proposal: ProvisioningProposal,
  branch: string | null,
): boolean {
  if (identity.key !== proposal.subject.key || identity.claimId !== proposal.subject.claimId) return false;
  const kind = identity.kind === "groom"
    ? "groom"
    : identity.purpose === "housekeep-routing" ? "housekeep" : "errand";
  return kind === proposal.subject.kind && identity.branch === branch;
}

function partialAuthorityMatches(authority: LocusRoleAuthority, proposal: ProvisioningProposal): boolean {
  if (authority.kind === "partial-errand") {
    return proposal.subject.kind === "errand"
      && proposal.subject.claimId === null
      && authority.key === proposal.subject.key;
  }
  if (authority.kind === "partial-housekeep") {
    return proposal.subject.kind === "housekeep"
      && proposal.subject.claimId === null
      && authority.key === proposal.subject.key;
  }
  return false;
}
