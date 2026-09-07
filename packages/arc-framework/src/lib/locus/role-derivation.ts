/** Pure checkout-role derivation from authority-only evidence. */

import type { RegisteredWorktree } from "../git/worktree-roster.js";

/** Registered checkout facts that can establish physical topology without branch-shape inference. */
export type CheckoutAuthorityTopology = Pick<RegisteredWorktree, "path" | "primary">;

/** Expected topology sourced from an already-selected authority subject. */
export interface SubjectTopologyExpectation {
  readonly branch?: string | null;
  readonly head?: string;
  readonly detached?: boolean;
}

/** Work-unit subject selected by marker or lifecycle authority. */
export interface DerivedWorkUnitSubject {
  readonly kind: "work-unit";
  readonly key: string;
}

/** Transient subject selected by marker or identity authority. */
export type DerivedTransientSubject =
  | { readonly kind: "partial-errand"; readonly key: string; readonly claimId: null }
  | {
      readonly kind: "errand" | "groom" | "housekeep";
      readonly key: string;
      readonly claimId: string;
    };

/** Any authority-bearing subject that may occupy a checkout. */
export type DerivedCheckoutSubject = DerivedWorkUnitSubject | DerivedTransientSubject;

interface SubjectEvidence<TSubject extends DerivedCheckoutSubject> {
  readonly kind: "present";
  readonly subject: TSubject;
  readonly expectedTopology: SubjectTopologyExpectation;
}

interface AbsentEvidence {
  readonly kind: "absent";
}

interface UnreadableEvidence {
  readonly kind: "unreadable";
  readonly reason: string;
}

/** Narrow ownership-marker authority projection. */
export type OwnershipMarkerProjection =
  | AbsentEvidence
  | UnreadableEvidence
  | SubjectEvidence<DerivedCheckoutSubject>;

/** Narrow work-unit lifecycle authority projection. */
export type WorkUnitLifecycleProjection =
  | AbsentEvidence
  | UnreadableEvidence
  | (SubjectEvidence<DerivedWorkUnitSubject> & { readonly state: "active" | "integration" | "retired" });

/** Narrow transient identity authority projection. */
export type ErrandIdentityProjection =
  | AbsentEvidence
  | UnreadableEvidence
  | SubjectEvidence<Exclude<DerivedTransientSubject, { kind: "partial-errand" }>>;

/** Complete authority-only input for one registered checkout. */
export interface CheckoutRoleAuthorityFacts {
  readonly topology: CheckoutAuthorityTopology;
  readonly marker: OwnershipMarkerProjection;
  readonly lifecycle: WorkUnitLifecycleProjection;
  readonly identity: ErrandIdentityProjection;
}

/** Diagnostic explaining why one checkout cannot be assigned a role. */
export interface DerivedRoleDiagnostic {
  readonly code: "authority-evidence-unreadable" | "authority-conflict" | "primary-safety-unproven";
  readonly source: "marker" | "lifecycle" | "identity" | "combined" | "primary-safety";
  readonly message: string;
}

interface SubjectRole<TKind extends "work-unit" | "transient" | "retired", TSubject extends DerivedCheckoutSubject> {
  readonly kind: TKind;
  readonly topology: CheckoutAuthorityTopology;
  readonly subject: TSubject;
  readonly expectedTopology: SubjectTopologyExpectation;
}

/** Least-destructive authority-derived role for one checkout. */
export type AuthorityDerivedCheckoutRole =
  | { readonly kind: "unoccupied-primary"; readonly topology: CheckoutAuthorityTopology }
  | SubjectRole<"work-unit", DerivedWorkUnitSubject>
  | SubjectRole<"transient", DerivedTransientSubject>
  | SubjectRole<"retired", DerivedWorkUnitSubject>
  | { readonly kind: "unmanaged-checkout"; readonly topology: CheckoutAuthorityTopology }
  | {
      readonly kind: "unresolved-checkout";
      readonly topology: CheckoutAuthorityTopology;
      readonly diagnostics: readonly DerivedRoleDiagnostic[];
    };

/** Final composition of an unoccupied-primary role with existing primary-safety facts. */
export type PrimaryComposedCheckoutRole =
  | AuthorityDerivedCheckoutRole
  | { readonly kind: "free-primary"; readonly topology: CheckoutAuthorityTopology };

/** Existing primary-safety facts narrowed to only the composition inputs. */
export type PrimarySafetyProjection =
  | { readonly kind: "complete"; readonly clean: boolean; readonly onBase: boolean }
  | { readonly kind: "error"; readonly message: string };

/**
 * Compose positive primary-safety facts without letting them originate checkout occupancy.
 * @param derived - Authority-derived checkout role.
 * @param safety - Existing clean/configured-base safety projection.
 * @returns A free primary only when both evidence layers positively agree.
 */
export function composePrimaryCheckoutRole(
  derived: AuthorityDerivedCheckoutRole,
  safety: PrimarySafetyProjection,
): PrimaryComposedCheckoutRole {
  if (derived.kind !== "unoccupied-primary") return derived;
  if (safety.kind === "complete" && safety.clean && safety.onBase) {
    return { kind: "free-primary", topology: derived.topology };
  }
  const message = safety.kind === "error"
    ? safety.message
    : "Physical primary is not both clean and on the configured base";
  return {
    kind: "unresolved-checkout",
    topology: derived.topology,
    diagnostics: [{ code: "primary-safety-unproven", source: "primary-safety", message }],
  };
}

/**
 * Derive one checkout role without consulting observed branch shape, durable locus state, or liveness.
 * @param facts - Narrow authority facts for one registered checkout.
 * @returns The least-destructive role established by those facts.
 */
export function deriveCheckoutRole(facts: CheckoutRoleAuthorityFacts): AuthorityDerivedCheckoutRole {
  const unreadable = (["marker", "lifecycle", "identity"] as const).flatMap((source) => {
    const evidence = facts[source];
    return evidence.kind === "unreadable"
      ? [{
          code: "authority-evidence-unreadable" as const,
          source,
          message: evidence.reason,
        }]
      : [];
  });
  if (unreadable.length > 0) {
    return { kind: "unresolved-checkout", topology: facts.topology, diagnostics: unreadable };
  }
  const candidates = [facts.marker, facts.lifecycle, facts.identity].flatMap((evidence) =>
    evidence.kind === "present" ? [{
      subject: evidence.subject,
      expectedTopology: evidence.expectedTopology,
    }] : []);
  const selected = candidates[0];
  if (selected !== undefined && candidates.some((candidate) => !sameSubject(candidate.subject, selected.subject))) {
    return unresolvedConflict(facts.topology, "Authority evidence selects different checkout subjects");
  }
  if (selected !== undefined) {
    const expectedTopology = mergeExpectations(candidates.map((candidate) => candidate.expectedTopology));
    if (expectedTopology === null) {
      return unresolvedConflict(facts.topology, "Authority evidence assigns contradictory expected topology");
    }
    if (selected.subject.kind === "work-unit") {
      return {
        kind: facts.lifecycle.kind === "present" && facts.lifecycle.state === "retired" ? "retired" : "work-unit",
        topology: facts.topology,
        subject: selected.subject,
        expectedTopology,
      };
    }
    return { kind: "transient", topology: facts.topology, subject: selected.subject, expectedTopology };
  }
  if (facts.topology.primary) {
    return { kind: "unoccupied-primary", topology: facts.topology };
  }
  return { kind: "unmanaged-checkout", topology: facts.topology };
}

function sameSubject(left: DerivedCheckoutSubject, right: DerivedCheckoutSubject): boolean {
  return left.kind === right.kind
    && left.key === right.key
    && (left.kind === "work-unit" || right.kind === "work-unit" || left.claimId === right.claimId);
}

function mergeExpectations(
  expectations: readonly SubjectTopologyExpectation[],
): SubjectTopologyExpectation | null {
  const result: { branch?: string | null; head?: string; detached?: boolean } = {};
  for (const expectation of expectations) {
    for (const key of ["branch", "head", "detached"] as const) {
      const value = expectation[key];
      if (value === undefined) continue;
      if (result[key] !== undefined && result[key] !== value) return null;
      Object.assign(result, { [key]: value });
    }
  }
  return result;
}

function unresolvedConflict(
  topology: CheckoutAuthorityTopology,
  message: string,
): Extract<AuthorityDerivedCheckoutRole, { kind: "unresolved-checkout" }> {
  return {
    kind: "unresolved-checkout",
    topology,
    diagnostics: [{ code: "authority-conflict", source: "combined", message }],
  };
}
