/** Preserve-or-unresolve corroboration of authority-derived checkout roles. */

import type { RegisteredWorktree } from "../git/worktree-roster.js";
import type {
  AuthorityDerivedCheckoutRole,
  CheckoutAuthorityTopology,
  SubjectTopologyExpectation,
} from "./role-derivation.js";

/** Registered observations that may corroborate but never originate a checkout subject. */
export type CheckoutCorroborationTopology = Pick<RegisteredWorktree, "branch" | "head" | "detached">;

/** Diagnostic for observations that reject an already-derived subject. */
export interface TopologyMismatchDiagnostic {
  readonly code: "topology-mismatch";
  readonly expected: SubjectTopologyExpectation;
  readonly observed: CheckoutCorroborationTopology;
  readonly message: string;
}

/** Result of comparing an authority-derived role with observed checkout topology. */
export type CorroboratedCheckoutRole =
  | AuthorityDerivedCheckoutRole
  | {
      readonly kind: "unresolved-checkout";
      readonly topology: CheckoutAuthorityTopology;
      readonly diagnostics: readonly TopologyMismatchDiagnostic[];
    };

/**
 * Corroborate an authority-derived role without choosing or retargeting its subject.
 * @param derived - Role already selected from authority-only facts.
 * @param observed - Narrow registered branch, HEAD, and detached observations.
 * @returns The exact input role when corroborated, otherwise an unresolved diagnostic.
 */
export function corroborateCheckoutRole(
  derived: AuthorityDerivedCheckoutRole,
  observed: CheckoutCorroborationTopology,
): CorroboratedCheckoutRole {
  if (derived.kind === "unresolved-checkout"
    || derived.kind === "unoccupied-primary"
    || derived.kind === "unmanaged-checkout") return derived;
  const expected = derived.expectedTopology;
  const mismatch = (["branch", "head", "detached"] as const).some((key) =>
    expected[key] !== undefined && expected[key] !== observed[key]);
  if (mismatch) {
    return {
      kind: "unresolved-checkout",
      topology: derived.topology,
      diagnostics: [{
        code: "topology-mismatch",
        expected,
        observed,
        message: "Observed checkout topology does not corroborate the authority-derived subject",
      }],
    };
  }
  return derived;
}
