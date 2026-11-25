/** Execution channels owned by the check engine rather than explicit caller bindings. */

/** Checked content a file check receives through the engine-owned channels below. */
export interface CheckContentContext { base?: string; tree: string; merged?: readonly string[] }

/** Clear these inherited channels before installing a child's notice and checked-content policy. */
export const CHECK_EXECUTION_ENVIRONMENT: ReadonlySet<string> = new Set([
  "ARC_CHECK_BASE", "ARC_CHECK_TREE", "ARC_CHECK_MERGED", "ARC_CHECK_NOTICE",
]);
