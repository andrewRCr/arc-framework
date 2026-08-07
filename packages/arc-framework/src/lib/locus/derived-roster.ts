/** Dormant checkout-row composition over authority, corroboration, and safety facts. */

import type { TransientIdentitySnapshot } from "../errand/identity-snapshot.js";
import type { RegisteredWorktree } from "../git/worktree-roster.js";
import type { CompletedEvidenceRead } from "../work-unit/completed-index.js";
import {
  projectIdentityAuthority,
  projectMarkerAuthority,
  projectWorkUnitLifecycle,
  type ActiveMetaEvidence,
  type ArchivedMetaEvidence,
  type DormantMarkerGenerationEvidence,
} from "./derived-lifecycle-evidence.js";
import { corroborateCheckoutRole } from "./role-corroboration.js";
import {
  composePrimaryCheckoutRole,
  deriveCheckoutRole,
  type DerivedCheckoutSubject,
  type DerivedTransientSubject,
  type PrimarySafetyProjection,
} from "./role-derivation.js";
import {
  projectCheckoutAuthorityTopology,
  projectCheckoutCorroborationTopology,
} from "./role-topology.js";
import type { LocusIdentityV1 } from "./schema/identity.js";
import type { SubjectMetaProjection } from "./subject-meta.js";

/** Stable dormant diagnostic attached only to the checkout whose facts failed. */
export interface DerivedCheckoutDiagnostic {
  readonly code: string;
  readonly source?: string;
  readonly message: string;
}

interface DerivedCheckoutRowBase {
  readonly checkout: RegisteredWorktree;
  readonly markerGeneration: string | null;
  readonly parentCheckoutPath: string | null;
  readonly origin: { readonly entry: string; readonly sourceDigest: string } | null;
  readonly identity: LocusIdentityV1 | null;
  readonly context: Extract<SubjectMetaProjection, { kind: "resolved" }> | null;
  readonly lifecycleLocation: "active" | "completed" | "parked" | null;
  readonly diagnostics: readonly DerivedCheckoutDiagnostic[];
}

/** Future internal row taxonomy; deliberately separate from the selected public locus schema. */
export type DerivedCheckoutRow = DerivedCheckoutRowBase & (
  | { readonly kind: "free-primary" | "unmanaged-checkout"; readonly subject: null }
  | {
      readonly kind: "work-unit" | "retired" | "transient";
      readonly subject: DerivedCheckoutSubject;
    }
  | { readonly kind: "unresolved-checkout"; readonly subject: DerivedCheckoutSubject | null }
);

/** Project one registered checkout without consulting records, branches as authority, or process liveness. */
export function projectDerivedCheckoutRow(options: {
  checkout: RegisteredWorktree;
  marker: DormantMarkerGenerationEvidence;
  activeMeta: ActiveMetaEvidence;
  archivedMeta?: ArchivedMetaEvidence;
  completed: CompletedEvidenceRead;
  identities: TransientIdentitySnapshot;
  primarySafety: PrimarySafetyProjection;
}): DerivedCheckoutRow {
  const archivedMeta = options.archivedMeta ?? { kind: "absent" };
  const markerAuthority = projectMarkerAuthority(options.marker, options.checkout);
  const markerSubject = markerAuthority.kind === "present" ? markerAuthority.subject : null;
  const markerWorkUnit = markerSubject?.kind === "work-unit" ? markerSubject : null;
  const markerTransient = markerSubject !== null && markerSubject.kind !== "work-unit"
    && markerSubject.kind !== "partial-errand"
    ? markerSubject
    : null;
  const lifecycle = projectWorkUnitLifecycle({
    activeMeta: options.activeMeta,
    archivedMeta,
    markerSubject: markerWorkUnit,
    completed: options.completed,
  });
  const identityAuthority = projectIdentityAuthority(options.identities, markerTransient);
  const derived = deriveCheckoutRole({
    topology: projectCheckoutAuthorityTopology(options.checkout),
    marker: markerAuthority,
    lifecycle,
    identity: identityAuthority,
  });
  const corroborated = corroborateCheckoutRole(
    derived,
    projectCheckoutCorroborationTopology(options.checkout),
  );
  const composed = corroborated.kind === "unoccupied-primary"
    ? composePrimaryCheckoutRole(corroborated, options.primarySafety)
    : corroborated;
  const markerDetails = projectMarkerDetails(options.marker);
  const subject = "subject" in composed
    ? composed.subject
    : "subject" in derived
      ? derived.subject
      : null;
  const identity = subject === null || subject.kind === "work-unit" || subject.kind === "partial-errand"
    ? null
    : exactIdentity(options.identities, subject);
  const base: DerivedCheckoutRowBase = {
    checkout: { ...options.checkout },
    markerGeneration: markerDetails.generation,
    parentCheckoutPath: markerDetails.parentCheckoutPath,
    origin: markerDetails.origin,
    identity,
    context: null,
    lifecycleLocation: options.activeMeta.kind === "present"
      ? options.activeMeta.location
      : archivedMeta.kind === "present"
        ? archivedMeta.location
        : composed.kind === "work-unit" && markerWorkUnit !== null
          ? "parked"
          : null,
    diagnostics: "diagnostics" in composed
      ? composed.diagnostics.map((diagnostic) => ({
          code: diagnostic.code,
          ...("source" in diagnostic ? { source: diagnostic.source } : {}),
          message: diagnostic.message,
        }))
      : [],
  };
  if (composed.kind === "unoccupied-primary") {
    return {
      ...base,
      kind: "unresolved-checkout",
      subject: null,
      diagnostics: [{ code: "primary-safety-unproven", message: "Primary safety was not composed" }],
    };
  }
  if (composed.kind === "free-primary" || composed.kind === "unmanaged-checkout") {
    return { ...base, kind: composed.kind, subject: null };
  }
  if (composed.kind === "unresolved-checkout") {
    return { ...base, kind: composed.kind, subject };
  }
  return { ...base, kind: composed.kind, subject: composed.subject };
}

function projectMarkerDetails(marker: DormantMarkerGenerationEvidence): {
  generation: string | null;
  parentCheckoutPath: string | null;
  origin: { entry: string; sourceDigest: string } | null;
} {
  if (marker.kind !== "present") {
    return { generation: null, parentCheckoutPath: null, origin: null };
  }
  const value = marker.marker;
  const origin = value.createdFor.kind === "partial-errand"
    && value.originEntry !== undefined
    ? { entry: value.originEntry, sourceDigest: value.originEntrySourceDigest }
    : null;
  return {
    generation: marker.generation,
    parentCheckoutPath: "parentCheckoutPath" in value ? value.parentCheckoutPath ?? null : null,
    origin,
  };
}

function exactIdentity(
  snapshot: TransientIdentitySnapshot,
  subject: Exclude<DerivedTransientSubject, { kind: "partial-errand" }>,
): LocusIdentityV1 | null {
  if (snapshot.kind !== "complete") return null;
  const identity = snapshot.projections.get(subject.key);
  if (identity === undefined || identity.claimId !== subject.claimId) return null;
  if (subject.kind === "groom") return identity.kind === "groom" ? identity : null;
  if (identity.kind !== "errand") return null;
  const expectedKind = identity.purpose === "housekeep-routing" ? "housekeep" : "errand";
  return subject.kind === expectedKind ? identity : null;
}
