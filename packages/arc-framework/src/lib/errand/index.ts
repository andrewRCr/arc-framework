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

export {
  ERRAND_BRANCH_TYPES,
  DEFAULT_ERRAND_BRANCH_TYPE,
  isErrandBranchType,
  type ErrandBranchType,
} from "./branch-type.js";

export {
  openErrand,
  type OpenErrandParams,
  type OpenErrandResult,
} from "./open.js";

export {
  linkErrandToInbox,
  type LinkErrandToInboxParams,
  type LinkErrandToInboxResult,
} from "./link.js";

export {
  closeErrand,
  type CloseErrandParams,
  type CloseErrandResult,
} from "./close.js";

export {
  retireErrand,
  type RetireErrandParams,
  type RetireErrandResult,
} from "./retire.js";

export {
  promoteErrand,
  type PromoteErrandContext,
  type PromoteErrandFs,
  type PromoteErrandParams,
  type PromoteErrandResult,
  type PromoteFloor,
} from "./promote.js";
