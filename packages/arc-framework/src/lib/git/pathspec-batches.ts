/**
 * Literal pathspec batching for Git invocations that take many exact paths as arguments.
 *
 * @module
 */

/** Keep literal pathspec batches below conservative cross-platform argument limits. */
const GIT_PATHSPEC_BATCH_BYTES = 16 * 1024;
const pathspecEncoder = new TextEncoder();

/**
 * Partition exact paths into `:(literal)` pathspec batches that each fit one argument list.
 *
 * @param paths - Repository-relative paths, matched literally rather than as globs.
 * @returns Pathspec batches in input order; empty when no paths are supplied.
 */
export function partitionGitPathspecBatches(paths: readonly string[]): string[][] {
  const batches: string[][] = [];
  let batch: string[] = [];
  let batchBytes = 0;
  for (const path of paths) {
    const pathspec = `:(literal)${path}`;
    const framedBytes = pathspecEncoder.encode(pathspec).byteLength + 1;
    if (batch.length > 0 && batchBytes + framedBytes > GIT_PATHSPEC_BATCH_BYTES) {
      batches.push(batch);
      batch = [];
      batchBytes = 0;
    }
    batch.push(pathspec);
    batchBytes += framedBytes;
  }
  if (batch.length > 0) batches.push(batch);
  return batches;
}
