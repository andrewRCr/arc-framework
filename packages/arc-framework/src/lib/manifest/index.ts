/**
 * Manifest domain — I/O, hashing, update diffing, three-way merge.
 *
 * @module
 */

export {
  validateManifest,
  readManifest,
  type ValidationResult,
} from "./store.js";

export { hashContent } from "./hash.js";

export {
  diffFileLists,
  type FileListDiff,
} from "./update-files.js";

export {
  mergeFileContents,
  type FileMergeFn,
  type MergeStatus,
  type ContentMergeResult,
} from "./merge.js";
