/** Dormant checkout-row composition over authority, corroboration, and safety facts. */

import type { StoreWorkUnitEvidence } from "./store-work-unit-evidence.js";
import type { z } from "zod";
import { DerivedCheckoutDiagnosticSchema } from "./derived-schema.js";
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
  type DerivedTransientSubject,
  type PrimarySafetyProjection,
} from "./role-derivation.js";
import {
  projectCheckoutAuthorityTopology,
  projectCheckoutCorroborationTopology,
} from "./role-topology.js";
import type { SessionAction } from "../session-init/actions.js";
import type { DerivedCheckoutSubject } from "./role-derivation.js";
import type { LocusIdentityV1 } from "./schema/identity.js";
import type { SubjectMetaProjection } from "./subject-meta.js";

/** Stable dormant diagnostic attached only to the checkout whose facts failed. */
export type DerivedCheckoutDiagnostic = z.infer<typeof DerivedCheckoutDiagnosticSchema>;

interface DerivedCheckoutRowBase {
  readonly checkout: RegisteredWorktree;
  readonly markerGeneration: string | null;
  readonly parentCheckoutPath: string | null;
  readonly origin: { readonly entry: string; readonly sourceDigest: string }
    | { readonly entry: string; readonly version: string } | null;
  readonly actions?: SessionAction[];
  readonly identity: LocusIdentityV1 | null;
  readonly context: Extract<SubjectMetaProjection, { kind: "resolved" }> | null;
  readonly lifecycleLocation: "active" | "completed" | "parked" | null;
  readonly diagnostics: readonly DerivedCheckoutDiagnostic[];
}

/** Future internal row taxonomy; deliberately separate from the selected public locus schema. */
export type DerivedCheckoutRow = DerivedCheckoutRowBase & (
  | { readonly kind: "free-primary" | "unmanaged-checkout"; readonly subject: null }
  | { readonly kind: "work-unit" | "retired" | "transient"; readonly subject: DerivedCheckoutSubject }
  | { readonly kind: "unresolved-checkout"; readonly subject: DerivedCheckoutSubject | null }
);

/** Project one registered checkout without consulting records, branches as authority, or process liveness. */
export function projectDerivedCheckoutRow(options: {
  checkout: RegisteredWorktree;
  marker: DormantMarkerGenerationEvidence;
  activeMeta: ActiveMetaEvidence;
  workUnit?: StoreWorkUnitEvidence;
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
  const lifecycle = options.workUnit === undefined ? projectWorkUnitLifecycle({
    activeMeta: options.activeMeta,
    archivedMeta,
    markerSubject: markerWorkUnit,
    completed: options.completed,
  }) : options.workUnit.kind === "present" || options.workUnit.kind === "terminal" ? options.workUnit.lifecycle : options.workUnit;
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
      : options.workUnit === undefined ? null : markerSubject;
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
    lifecycleLocation: options.workUnit?.kind === "terminal" ? null : options.workUnit?.kind === "present"
      ? options.workUnit.record.placement?.kind === "completed" ? "completed" : options.workUnit.record.placement?.kind === "active" ? "active" : "parked"
      : options.activeMeta.kind === "present"
      ? options.activeMeta.location
      : archivedMeta.kind === "present"
        ? archivedMeta.location
        : composed.kind === "work-unit" && markerWorkUnit !== null
          ? "parked"
          : null,
    diagnostics: [...("diagnostics" in composed
      ? composed.diagnostics.map((diagnostic) => ({
          code: diagnostic.code,
          ...("source" in diagnostic ? { source: diagnostic.source } : {}),
          message: diagnostic.message,
        }))
      : []), ...identityDiagnostics(options.identities, subject, identity)],
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
    return { ...base, kind: composed.kind, subject,
      diagnostics: [...base.diagnostics, ...pendingErrandRetry(options)] };
  }
  return { ...base, kind: composed.kind, subject: composed.subject };
}

function identityDiagnostics(snapshot: TransientIdentitySnapshot, subject: DerivedCheckoutSubject | null, identity: LocusIdentityV1 | null): DerivedCheckoutDiagnostic[] {
  if (identity === null || subject === null || snapshot.kind !== "complete") return [];
  return snapshot.diagnostics.filter(diagnostic => diagnostic.key === subject.key).map(diagnostic => ({ code: diagnostic.kind, source: "identity",
    message: "message" in diagnostic ? diagnostic.message : `Transient identity ${subject.key} is ${diagnostic.kind}` }));
}

function projectMarkerDetails(marker: DormantMarkerGenerationEvidence): {
  generation: string | null;
  parentCheckoutPath: string | null;
  origin: DerivedCheckoutRow["origin"];
} {
  if (marker.kind !== "present") {
    return { generation: null, parentCheckoutPath: null, origin: null };
  }
  const value = marker.marker;
  const origin: DerivedCheckoutRow["origin"] = value.createdFor.kind === "partial-errand"
    && value.originEntry !== undefined
    ? value.originEntryVersion !== undefined ? { entry: value.originEntry, version: value.originEntryVersion }
      : { entry: value.originEntry, sourceDigest: value.originEntrySourceDigest }
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

/** Narrate a possible retry without making a pending marker authoritative. */
function pendingErrandRetry(options: Parameters<typeof projectDerivedCheckoutRow>[0]): DerivedCheckoutDiagnostic[] {
  if (options.marker.kind !== "present" || options.checkout.primary || options.checkout.detached) return [];
  const marker = options.marker.marker;
  if (!marker.spawnedByArc || marker.provisioning !== "pending" || marker.createdFor.kind !== "errand") return [];
  const subject = marker.createdFor;
  const identity = exactIdentity(options.identities, { kind: "errand", key: subject.slug, claimId: subject.claimId });
  if (identity?.kind !== "errand" || identity.purpose !== "errand" || identity.state !== "open"
    || identity.branch !== options.checkout.branch || options.activeMeta.kind !== "absent") return [];
  return [{
    code: "pending-errand-provisioning",
    message: `Retry arc errand open ${subject.slug} --isolate --json from the free primary checkout. `
      + "Setup resumes only with a clean checkout and a head preserved by base; preserve local work first.",
  }];
}
