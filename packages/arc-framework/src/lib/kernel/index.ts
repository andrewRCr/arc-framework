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
  fromAsyncThrowable,
  fromThrowable,
  ok,
  type Result,
} from "./result.js";
export {
  PrioritySchema,
  WORK_UNIT_STATE_ORDER,
  WorkClassSchema,
  WorkUnitStateSchema,
  validateClass,
  validatePriority,
  validateState,
  type Priority,
  type WorkClass,
  type WorkUnitState,
} from "./schema/vocabulary.js";
