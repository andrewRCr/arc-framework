/**
 * The ignore check before a command's first write into a root: a cached pass proves the same roots, configuration and
 * ignore sources. A fresh pass brackets Git's verdict with snapshots and confirms its captured configuration.
 */
import type { ObjectFormat } from "./blob-id.js";
import type { ConfiguredIgnoreRules } from "./configuration.js";
import {
  guardedProjectionRoots, guardProjectionIgnores, predictableIgnoreFiles, refuseEveryRoot, type ProjectionIgnoreGuardInput,
  type ProjectionIgnoreVerdict,
} from "./ignore-guard.js";
import { compareIgnoreFiles, snapshotIgnoreFiles } from "./ignore-snapshot.js";
import type { IgnoreGuardBasis, IgnoreRulesSelection, IgnoreFileRecord } from "./index-schema.js";

/** What the check found: the same authorized basis, a fresh pass with its basis and sources, or a refusal. */
export type IgnoreCheck =
  | { readonly kind: "unchanged" }
  | { readonly kind: "passed"; readonly records: readonly IgnoreFileRecord[]; readonly basis: IgnoreGuardBasis }
  | Extract<ProjectionIgnoreVerdict, { readonly kind: "refused" }>;

/** What the check reads. */
export interface IgnoreCheckInput {
  readonly guard: ProjectionIgnoreGuardInput;
  /** What the index recorded at the guard's last pass, null where none is recorded. */
  readonly records: readonly IgnoreFileRecord[] | null;
  /** The index's racy reference, null where missing. */
  readonly reference: bigint | null;
  readonly format: ObjectFormat;
  /** The excludes source and all ordered excludes/case-policy values from the command's configuration read. */
  readonly ignoreRules: ConfiguredIgnoreRules;
  /** Confirm the captured rules with the same reader and invocation environment. */
  readonly readIgnoreRules: () => Promise<ConfiguredIgnoreRules>;
  /** The actual roots and configuration authorized by the last passing guard. */
  readonly recordedGuard: IgnoreGuardBasis | null;
}

/**
 * Reuse a pass only for its exact roots, rules and unchanged sources; otherwise run a bound fresh guard.
 * @param input - The guard's boundaries, current configuration and last passing basis.
 * @returns Whether the projection may write into each root.
 */
export async function checkIgnores(input: IgnoreCheckInput): Promise<IgnoreCheck> {
  const rules = input.ignoreRules;
  if (rules.kind === "invalid") return refuseEveryRoot(input.guard.identity, rules.remedy.text);
  const guard = { ...input.guard };
  const basis: IgnoreGuardBasis = {
    roots: guardedProjectionRoots(guard.identity).map(({ path }) => `${guard.root}/${path}`),
    configuration: { path: rules.path, values: [...rules.values], ignoreCase: [...rules.ignoreCase] },
  };
  if (input.recordedGuard !== null && sameValues(basis.roots, input.recordedGuard.roots)
    && sameSelection(basis.configuration, input.recordedGuard.configuration)
    && await compareIgnoreFiles(input.records, input.reference, input.format) === "unchanged") return { kind: "unchanged" };
  return refreshIgnores({ ...input, guard }, basis);
}

/** Snapshot a guard bound to one basis, accepting it only while that basis still holds. */
async function refreshIgnores(input: IgnoreCheckInput, basis: IgnoreGuardBasis): Promise<IgnoreCheck> {
  let known: string[];
  try {
    known = await predictableIgnoreFiles(input.guard);
  } catch (error) {
    return refuseEveryRoot(input.guard.identity, error instanceof Error ? error.message : String(error));
  }
  known = union(known, input.records?.map((record) => record.path) ?? []);
  const { configuration } = basis;
  const ignoreCase = configuration.ignoreCase.length === 0 ? "false" : configuration.ignoreCase.at(-1) ?? null;
  for (let read = 0; read < GUARD_READS; read += 1) {
    const before = await snapshotIgnoreFiles(known, input.format);
    const verdict = await guardProjectionIgnores({ ...input.guard, excludesFile: configuration.path, ignoreCase });
    if (verdict.kind === "refused") return verdict;
    const after = await snapshotIgnoreFiles(verdict.ignoreFiles, input.format);
    if (after.every((record) => before.some((read) => isSameRecord(read, record)))) return confirmedPass(input, basis, after);
    known = union(known, verdict.ignoreFiles);
  }
  return refuseEveryRoot(input.guard.identity, "The ignore files kept changing while the guard read them");
}

/** Confirm only a fresh pass; an unchanged cache never pays for this configuration read. */
async function confirmedPass(input: IgnoreCheckInput, basis: IgnoreGuardBasis, records: readonly IgnoreFileRecord[]): Promise<IgnoreCheck> {
  try {
    const current = await input.readIgnoreRules();
    if (current.kind === "invalid") return refuseEveryRoot(input.guard.identity, current.remedy.text);
    if (!sameSelection(current, basis.configuration)) return refuseEveryRoot(input.guard.identity,
      "The effective ignore configuration selection changed while the guard read it; run the command again.");
    return { kind: "passed", records, basis };
  } catch (error) {
    return refuseEveryRoot(input.guard.identity, error instanceof Error ? error.message : String(error));
  }
}

/** Every raw value matters: Git can refuse an earlier value even when the last one is valid. */
function sameSelection(left: IgnoreRulesSelection, right: IgnoreRulesSelection): boolean {
  return left.path === right.path && sameValues(left.values, right.values) && sameValues(left.ignoreCase, right.ignoreCase);
}

function sameValues(left: readonly (string | null)[], right: readonly (string | null)[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

/** How many times the check reads the ignore files around the call before it fails closed. */
const GUARD_READS = 3;

function union(paths: readonly string[], more: readonly string[]): string[] {
  return [...new Set([...paths, ...more])];
}

/** Whether two reads agree: both absent, or the same path type, stat and content. */
function isSameRecord(left: IgnoreFileRecord, right: IgnoreFileRecord): boolean {
  if (left.path !== right.path) return false;
  if (left.stat === null || right.stat === null) return left.stat === right.stat;
  const { type, size, mtimeNs, ino } = left.stat;
  return type === right.stat.type && size === right.stat.size && mtimeNs === right.stat.mtimeNs && ino === right.stat.ino
    && left.blob === right.blob;
}
