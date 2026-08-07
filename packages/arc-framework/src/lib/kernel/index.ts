/**
 * Shared, bottom-of-graph runtime contracts for the ARC CLI.
 *
 * This barrel intentionally exposes only kernel-owned public contracts. Kernel
 * modules may depend on Node builtins and approved external libraries, but not
 * on any other CLI source module.
 */

export {
  ResultAsync,
  err,
  errAsync,
  fromAsyncThrowable,
  fromThrowable,
  ok,
  okAsync,
  type Result,
} from "./result.js";
export {
  ArcError,
  toArcError,
  type ArcErrorCode,
} from "./errors.js";
export {
  assertCanonicalDigest,
  canonicalDigest,
  canonicalize,
  digestBytes,
  isCanonicalDigest,
  sortByCanonicalBytes,
  type CanonicalDigest,
} from "./canonical/canonical-json.js";
export {
  isManagedPath,
  type ManagedPath,
  validateManagedPath,
} from "./canonical/managed-path.js";
export {
  PrioritySchema,
  RemoteEvidenceSchema,
  RemoteFailureReasonSchema,
  WORK_UNIT_STATE_ORDER,
  WorkClassSchema,
  WorkUnitStateSchema,
  validateClass,
  validatePriority,
  validateState,
  withRemoteEvidence,
  type Priority,
  type RemoteEvidence,
  type RemoteFailureReason,
  type WorkClass,
  type WorkUnitState,
} from "./schema/vocabulary.js";
export {
  SLUG_PATTERN,
  SlugSchema,
  isSlugSafe,
  type Slug,
} from "./schema/slug.js";
export {
  createKernelRegistry,
  createRegistry,
  SchemaError,
  type KernelJSONSchema,
  type KernelJSONSchemaBundle,
  type KernelRegistry,
  type KernelSchemaMeta,
  type MigrationPosture,
  type SchemaErrorCode,
} from "./schema/registry.js";
