/** Evidence-delta normalization from existing producer boundaries. */

import {
  BoundedEvidenceResidualSchema,
  compareEvidencePaths,
  EvidenceDeltaProducerSchema,
  EvidenceDeltaSchema,
  integrationCoordinatesEqual,
  type EvidenceDelta,
  type EvidenceDeltaProducer,
  type EvidenceOverlap,
  type EvidenceOverlapObservation,
  type HostMergeAdmission,
  type IntegrationCoordinate,
  type NormalizedHostAdmission,
} from "./schema.js";

const NOT_APPLICABLE_OVERLAP = {
  kind: "not-applicable",
  substantivePaths: [],
  regenerablePaths: [],
} as const;
const NOT_APPLICABLE_HOST = {
  state: "not-applicable",
  coordinates: null,
  evidenceRef: null,
  detail: null,
} as const;

function canonicalPaths(paths: readonly string[]): string[] {
  return [...new Set(paths)].sort(compareEvidencePaths);
}

function boundedResidual(paths: readonly string[]): string[] | null {
  const canonical = canonicalPaths(paths);
  if (canonical.length === 0) return null;
  const parsed = BoundedEvidenceResidualSchema.safeParse(canonical);
  return parsed.success ? parsed.data : null;
}

function normalizeOverlap(input: EvidenceOverlapObservation): EvidenceOverlap {
  if (input.status === "unavailable") {
    return { kind: "unknown", substantivePaths: [], regenerablePaths: [] };
  }
  const substantivePaths = canonicalPaths(input.substantivePaths);
  return {
    kind: substantivePaths.length === 0 ? "disjoint" : "overlapping",
    substantivePaths,
    regenerablePaths: canonicalPaths(input.regenerablePaths),
  } as EvidenceOverlap;
}

function normalizeHostAdmission(
  input: HostMergeAdmission | undefined,
  expected: IntegrationCoordinate,
): NormalizedHostAdmission {
  if (input === undefined) return NOT_APPLICABLE_HOST;
  const evidenceRef = input.evidenceRef ?? null;
  if (!integrationCoordinatesEqual(input.coordinates, expected)) {
    return {
      state: "unresolved",
      coordinates: null,
      evidenceRef,
      detail: "Host admission coordinates do not match the normalized integration observation.",
    };
  }
  if (input.state === "mergeable") {
    return { state: "mergeable", coordinates: input.coordinates, evidenceRef, detail: null };
  }
  return {
    state: input.state,
    coordinates: input.coordinates,
    evidenceRef,
    detail: input.detail,
  };
}

function deltaPaths(delta: { added: string[]; removed: string[]; changed: string[] }): string[] {
  return canonicalPaths([...delta.added, ...delta.removed, ...delta.changed]);
}

function relationFromProof(
  proof: Extract<EvidenceDeltaProducer, { cause: "member-rewrite" }>["proof"],
): "equal" | "mechanical-reapply" | "clean-divergence" | "interaction" | "unavailable" {
  return proof.status === "accepted"
    ? proof.proof === "tree-equality" ? "equal" : "mechanical-reapply"
    : proof.reason === "contribution-diverged"
      ? "clean-divergence"
      : proof.reason === "contribution-conflicted" ? "interaction" : "unavailable";
}

function residualFromProof(
  proof: Extract<EvidenceDeltaProducer, { cause: "member-rewrite" }>["proof"],
): string[] | null {
  return proof.status === "refused" && "paths" in proof
    ? boundedResidual(proof.paths)
    : null;
}

/** Compose one producer observation into the total normalized envelope. */
export function composeEvidenceDelta(input: EvidenceDeltaProducer): EvidenceDelta {
  const producer = EvidenceDeltaProducerSchema.parse(input);
  switch (producer.cause) {
    case "base-movement": {
      const overlap = normalizeOverlap(producer.observation.overlap);
      return EvidenceDeltaSchema.parse({
        cause: producer.cause,
        relation: "not-applicable",
        overlap,
        hostAdmission: normalizeHostAdmission(
          producer.hostAdmission,
          producer.observation.coordinates,
        ),
        approvedScope: "not-applicable",
        observed: { kind: producer.cause, coordinates: producer.observation.coordinates },
        residual: overlap.kind === "overlapping"
          ? boundedResidual(overlap.substantivePaths)
          : null,
      });
    }
    case "base-merge": {
      const overlap = normalizeOverlap(producer.overlap);
      return EvidenceDeltaSchema.parse({
        cause: producer.cause,
        relation: producer.projection === undefined
          ? "not-applicable"
          : relationFromProof(producer.projection.proof),
        overlap,
        hostAdmission: normalizeHostAdmission(producer.hostAdmission, producer.after),
        approvedScope: "not-applicable",
        observed: { kind: producer.cause, before: producer.before, after: producer.after },
        residual: producer.projection === undefined
          ? overlap.kind === "overlapping" ? boundedResidual(overlap.substantivePaths) : null
          : residualFromProof(producer.projection.proof),
      });
    }
    case "member-rewrite": {
      return EvidenceDeltaSchema.parse({
        cause: producer.cause,
        relation: relationFromProof(producer.proof),
        overlap: NOT_APPLICABLE_OVERLAP,
        hostAdmission: NOT_APPLICABLE_HOST,
        approvedScope: "not-applicable",
        observed: { kind: producer.cause, endpoints: producer.endpoints },
        residual: residualFromProof(producer.proof),
      });
    }
    case "approved-fix":
      return EvidenceDeltaSchema.parse({
        cause: producer.cause,
        relation: "not-applicable",
        overlap: NOT_APPLICABLE_OVERLAP,
        hostAdmission: NOT_APPLICABLE_HOST,
        approvedScope: producer.response.approvedVerification ?? "full",
        observed: {
          kind: producer.cause,
          candidateId: producer.response.candidateId,
          dispositionId: producer.response.dispositionId,
          oldTarget: producer.response.oldTarget,
          newTarget: producer.response.newTarget,
        },
        residual: boundedResidual(deltaPaths(producer.delta)),
      });
    case "unexplained":
      return EvidenceDeltaSchema.parse({
        cause: producer.cause,
        relation: "not-applicable",
        overlap: NOT_APPLICABLE_OVERLAP,
        hostAdmission: NOT_APPLICABLE_HOST,
        approvedScope: "not-applicable",
        observed: {
          kind: producer.cause,
          candidateId: producer.candidateId,
          priorTarget: producer.priorTarget,
          currentTarget: producer.currentTarget,
        },
        residual: boundedResidual(deltaPaths(producer.delta)),
      });
    default:
      return assertNever(producer);
  }
}

function assertNever(value: never): never {
  throw new Error(`Unhandled evidence-delta producer: ${JSON.stringify(value)}`);
}
