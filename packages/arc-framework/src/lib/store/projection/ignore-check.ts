/**
 * The ignore check before a command's first write into a root: the guard runs only where an ignore file may have changed
 * since its last pass, and a pass records the ignore files it rests on, each read before the call and again after it, so
 * an edit landing while Git reads never becomes the baseline a later command skips the call against.
 */
import type { ObjectFormat } from "./blob-id.js";
import type { ConfiguredExcludesFile } from "./configuration.js";
import {
  guardProjectionIgnores, predictableIgnoreFiles, refuseEveryRoot, type ProjectionIgnoreGuardInput,
  type ProjectionIgnoreVerdict,
} from "./ignore-guard.js";
import { compareIgnoreFiles, snapshotIgnoreFiles } from "./ignore-snapshot.js";
import type { ExcludesSelection, IgnoreFileRecord } from "./index-schema.js";

/** What the check found: no ignore file changed since the last pass, a pass with what it rests on, or a refusal. */
export type IgnoreCheck =
  | { readonly kind: "unchanged" }
  | { readonly kind: "passed"; readonly records: readonly IgnoreFileRecord[]; readonly excludesFile: ExcludesSelection }
  | Extract<ProjectionIgnoreVerdict, { readonly kind: "refused" }>;

/** What the check reads. */
export interface IgnoreCheckInput {
  readonly guard: ProjectionIgnoreGuardInput;
  /** What the index recorded at the guard's last pass, null where none is recorded. */
  readonly records: readonly IgnoreFileRecord[] | null;
  /** The index's racy reference, null where missing. */
  readonly reference: bigint | null;
  readonly format: ObjectFormat;
  /** The effective path and all raw core.excludesFile values from this command's configuration read. */
  readonly excludesFile: ConfiguredExcludesFile;
  /** Confirm the effective selection with the same configuration reader and invocation environment. */
  readonly readExcludesFile: () => Promise<ConfiguredExcludesFile>;
  /** The configuration basis the last passing guard used. */
  readonly recordedExcludesFile: ExcludesSelection | null;
}

/**
 * Run the guard where an ignore file may have changed since its last pass.
 * @param input - The guard's boundaries and what its last pass recorded.
 * @returns Whether the projection may write into each root.
 */
export async function checkIgnores(input: IgnoreCheckInput): Promise<IgnoreCheck> {
  if (input.excludesFile.kind === "invalid") return refuseEveryRoot(input.guard.identity, input.excludesFile.remedy.text);
  if (sameSelection(input.excludesFile, input.recordedExcludesFile)
    && await compareIgnoreFiles(input.records, input.reference, input.format) === "unchanged") return { kind: "unchanged" };
  return refreshIgnores(input, input.excludesFile);
}

/** Snapshot a guard bound to one selection, accepting it only while that selection still holds. */
async function refreshIgnores(input: IgnoreCheckInput, excludesFile: ExcludesSelection): Promise<IgnoreCheck> {
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
    const verdict = await guardProjectionIgnores({ ...input.guard, excludesFile: excludesFile.path });
    // A refusal stands as read; repairing it and running the command again is recoverable.
    if (verdict.kind === "refused") return verdict;
    const after = await snapshotIgnoreFiles(verdict.ignoreFiles, input.format);
    if (after.every((record) => before.some((read) => isSameRecord(read, record)))) return confirmedPass(input, excludesFile, after);
    known = union(known, verdict.ignoreFiles);
  }
  return refuseEveryRoot(input.guard.identity, "The ignore files kept changing while the guard read them");
}

/** Confirm only a fresh pass; an unchanged cache never pays for this configuration read. */
async function confirmedPass(input: IgnoreCheckInput, excludesFile: ExcludesSelection, records: readonly IgnoreFileRecord[]): Promise<IgnoreCheck> {
  try {
    const current = await input.readExcludesFile();
    if (current.kind === "invalid") return refuseEveryRoot(input.guard.identity, current.remedy.text);
    if (!sameSelection(current, excludesFile)) return refuseEveryRoot(input.guard.identity, "The effective excludes selection changed while the guard read it; run the command again.");
    return { kind: "passed", records, excludesFile: { path: excludesFile.path, values: [...excludesFile.values] } };
  } catch (error) {
    return refuseEveryRoot(input.guard.identity, error instanceof Error ? error.message : String(error));
  }
}

/** Every raw value matters: Git can refuse an earlier path even when its last value is valid. */
function sameSelection(left: ExcludesSelection, right: ExcludesSelection | null): boolean {
  return right !== null && left.path === right.path && left.values.length === right.values.length
    && left.values.every((value, index) => value === right.values[index]);
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
