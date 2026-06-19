/**
 * Errand domain — the errand record model, the orphan state-ref read/write
 * primitives, and the per-slug tree-merge backing the errand lifecycle.
 *
 * @module
 */

export {
  errandsRef,
  type ErrandRecordIO,
  type GitExecInput,
} from "./ref-tree.js";

export {
  serializeErrandRecord,
  deserializeErrandRecord,
  readErrandRecord,
  listErrandRecords,
  writeErrandRecord,
  removeErrandRecord,
  type ErrandRecord,
  type ErrandOrigin,
} from "./record.js";

export {
  mergeErrandTrees,
  reconcileErrandPush,
  incomingErrandRef,
  type ErrandTreeMerge,
  type ErrandPushOutcome,
} from "./merge.js";
