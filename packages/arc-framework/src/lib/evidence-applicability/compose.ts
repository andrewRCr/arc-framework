/** Evidence-delta normalization from existing producer boundaries. */

import { assertNever } from "../kernel/index.js";
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

/**
 * Convert one observed overlap into the arm this layer answers with.
 *
 * Every observation crosses into the reduced space here, and the crossing is exhaustive on purpose: an arm added
 * to the observation is a compiler event at this line rather than a value landing on whichever branch its path
 * shape happens to match. That distinction is not cosmetic — an arm carrying no paths at all reads as an empty
 * path list, and an empty path list is the strongest accept the reducer has.
 *
 * A base that cannot be compared from reduces to the same arm an unreadable read does: all three mean
 * disjointness was not established, which is the one question this layer answers. Which of them it was rides
 * along as the arm's cause, so the reduction can report it without the verdict space gaining an answer.
 */
function normalizeOverlap(input: EvidenceOverlapObservation): EvidenceOverlap {
  switch (input.status) {
    case "ambiguous":
      return { kind: "unknown", cause: "ambiguous", substantivePaths: [], regenerablePaths: [] };
    case "unrelated":
      return { kind: "unknown", cause: "unrelated", substantivePaths: [], regenerablePaths: [] };
    case "unavailable":
      return { kind: "unknown", cause: "read-failed", substantivePaths: [], regenerablePaths: [] };
    case "available": {
      const substantivePaths = canonicalPaths(input.substantivePaths);
      const regenerablePaths = canonicalPaths(input.regenerablePaths);
      return substantivePaths.length === 0
        ? { kind: "disjoint", substantivePaths: [], regenerablePaths }
        : { kind: "overlapping", substantivePaths, regenerablePaths };
    }
    default:
      return assertNever(input);
  }
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
