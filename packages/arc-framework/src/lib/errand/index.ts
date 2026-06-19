/**
 * Errand domain — the errand record model and the orphan state-ref read/write
 * primitives backing the errand lifecycle.
 *
 * @module
 */

export {
  errandsRef,
  serializeErrandRecord,
  deserializeErrandRecord,
  readErrandRecord,
  listErrandRecords,
  writeErrandRecord,
  removeErrandRecord,
  type ErrandRecord,
  type ErrandOrigin,
  type ErrandRecordIO,
  type GitExecInput,
} from "./record.js";
