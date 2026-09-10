/** Public evidence-applicability substrate. */

export {
  PathTreatmentSchema,
  classifyPathTreatment,
  type PathTreatment,
  type PathTreatmentContext,
} from "./path-treatment.js";
export { composeEvidenceDelta } from "./compose.js";
export {
  BoundedEvidenceResidualSchema,
  BaseMovementObservationSchema,
  EvidenceOverlapObservationSchema,
  EvidenceDeltaProducerSchema,
  EvidenceDeltaSchema,
  EvidenceOverlapSchema,
  EvidenceRelationSchema,
  HostMergeAdmissionSchema,
  IntegrationCoordinateSchema,
  MAX_EVIDENCE_APPLICABILITY_PATH_BYTES,
  MAX_EVIDENCE_APPLICABILITY_PATHS,
  type BaseMovementObservation,
  type BoundedEvidenceResidual,
  type EvidenceDelta,
  type EvidenceDeltaProducer,
  type EvidenceOverlap,
  type EvidenceOverlapObservation,
  type EvidenceRelation,
  type HostMergeAdmission,
  type IntegrationCoordinate,
  type NormalizedHostAdmission,
} from "./schema.js";
