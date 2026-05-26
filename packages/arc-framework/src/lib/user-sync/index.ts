/**
 * User-sync inference domain — pure helpers for classifying user-notes-ref
 * divergence and related signals.
 *
 * @module
 */

export {
  inferUserSyncCause,
  SAVED_AT_RECENCY_THRESHOLD_MS,
  type InferUserSyncCauseInput,
  type InferUserSyncCauseOutput,
  type UserSyncCause,
  type UserSyncCauseConfidence,
  type UserSyncRefRelation,
} from "./inference.js";

export { classifyUserSyncPath, type UserSyncClass } from "./classifier.js";
