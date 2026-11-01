/**
 * The ignore check before a command's first write into a root: the guard runs only where an ignore file may have changed
 * since its last pass, and a pass records the ignore files it rests on, each read before the call and again after it, so
 * an edit landing while Git reads never becomes the baseline a later command skips the call against.
 */
import type { ObjectFormat } from "./blob-id.js";
import {
  guardProjectionIgnores, predictableIgnoreFiles, refuseEveryRoot, type ProjectionIgnoreGuardInput,
  type ProjectionIgnoreVerdict,
} from "./ignore-guard.js";
import { compareIgnoreFiles, snapshotIgnoreFiles } from "./ignore-snapshot.js";
import type { IgnoreFileRecord } from "./index-schema.js";

/** What the check found: no ignore file changed since the last pass, a pass with what it rests on, or a refusal. */
export type IgnoreCheck =
  | { readonly kind: "unchanged" }
  | { readonly kind: "passed"; readonly records: readonly IgnoreFileRecord[] }
  | Extract<ProjectionIgnoreVerdict, { readonly kind: "refused" }>;

/** What the check reads. */
export interface IgnoreCheckInput {
  readonly guard: ProjectionIgnoreGuardInput;
  /** What the index recorded at the guard's last pass, null where none is recorded. */
  readonly records: readonly IgnoreFileRecord[] | null;
  /** The index's racy reference, null where missing. */
  readonly reference: bigint | null;
  readonly format: ObjectFormat;
}

/**
 * Run the guard where an ignore file may have changed since its last pass.
 * @param input - The guard's boundaries and what its last pass recorded.
 * @returns Whether the projection may write into each root.
 */
export async function checkIgnores(input: IgnoreCheckInput): Promise<IgnoreCheck> {
  if (await compareIgnoreFiles(input.records, input.reference, input.format) === "unchanged") return { kind: "unchanged" };
  let known: string[];
  try {
    known = await predictableIgnoreFiles(input.guard);
  } catch (error) {
    return refuseEveryRoot(input.guard.identity, error instanceof Error ? error.message : String(error));
  }
  // The last pass named every source the call is likely to name again, a core.excludesFile among them.
  known = union(known, input.records?.map((record) => record.path) ?? []);
  for (let read = 0; read < GUARD_READS; read += 1) {
    const before = await snapshotIgnoreFiles(known, input.format);
    const verdict = await guardProjectionIgnores(input.guard);
    // A refusal stands as read; repairing it and running the command again is recoverable.
    if (verdict.kind === "refused") return verdict;
    const after = await snapshotIgnoreFiles(verdict.ignoreFiles, input.format);
    if (after.every((record) => before.some((read) => isSameRecord(read, record)))) return { kind: "passed", records: after };
    known = union(known, verdict.ignoreFiles);
  }
  return refuseEveryRoot(input.guard.identity, "The ignore files kept changing while the guard read them");
}

/** How many times the check reads the ignore files around the call before it fails closed. */
const GUARD_READS = 3;

function union(paths: readonly string[], more: readonly string[]): string[] {
  return [...new Set([...paths, ...more])];
}

/** Whether two reads of an ignore file agree: both absent, or the same stat and blob id. */
function isSameRecord(left: IgnoreFileRecord, right: IgnoreFileRecord): boolean {
  if (left.path !== right.path) return false;
  if (left.stat === null || right.stat === null) return left.stat === right.stat;
  const { type, size, mtimeNs, ino } = left.stat;
  return type === right.stat.type && size === right.stat.size && mtimeNs === right.stat.mtimeNs && ino === right.stat.ino
    && left.blob === right.blob;
}
