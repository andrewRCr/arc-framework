/** Refuse committed tracked-state changes outside the import's selected read and inherited content. */
import type { WindowImportContext } from "./import-context.js";
import type { WindowRecord } from "./hold.js";
import { WindowRefusal, type WindowFinding } from "./result.js";
import type { ComposedLifecycleIndexResult } from "../../lib/work-unit/composed-lifecycle-index.js";
import { createWindowReadMap, type WindowParkedPointer, type WindowReadMap } from "./read-map.js";
import { createWindowReadRule, type WindowReadRule, type WindowPathRule } from "./read-rule.js";

/** One compared revision: main's, or one side of a branch's tip. */
export interface WindowComparisonRevision { ref: string; tip: string; branchTip: boolean }
/** One tracked path that fails the read rule at one compared revision. */
export interface WindowTrackedRecordFailure { target: WindowComparisonRevision; result: WindowPathRule }
/** The revisions to compare: main's tip, and both acquired sides of every named branch. */
export interface WindowTrackedRecordBasis {
  main: string; branches: readonly string[];
  local: Readonly<Record<string, string>>; origin: Readonly<Record<string, string>>;
}
/** Read-map findings, every failing path, and the parked pointers, kept apart so a caller can act on each path. */
export interface WindowTrackedRecordInspection {
  findings: WindowFinding[]; failures: WindowTrackedRecordFailure[]; parked: readonly WindowParkedPointer[];
}

/** Inspect main and both acquired sides of every live branch, retaining each affected revision and file. */
export async function readWindowTrackedRecordFindings(context: WindowImportContext, record: WindowRecord,
  composition: ComposedLifecycleIndexResult): Promise<WindowFinding[]> {
  const main = record.branches.local.main;
  if (!main) throw new WindowRefusal([{ subject: "main", condition: "The importing main revision is unavailable.",
    remedy: "Restore the importing main branch and retry check." }]);
  const { findings, failures } = await inspectWindowTrackedRecords(context, { main,
    branches: [...new Set([...Object.keys(record.branches.live), record.flip.branch])],
    local: record.branches.local, origin: record.branches.origin }, composition);
  return [...findings, ...failures.map(failure => trackedRecordFinding(failure.result, failure.target))];
}

/** Find every tracked path the read rule fails at the basis's revisions. */
export async function inspectWindowTrackedRecords(context: WindowImportContext, basis: WindowTrackedRecordBasis,
  composition: ComposedLifecycleIndexResult): Promise<WindowTrackedRecordInspection> {
  const map = await createWindowReadMap(context, basis.main, composition), rule = createWindowReadRule(context, map);
  const failures: WindowTrackedRecordFailure[] = [];
  for (const target of comparisonRevisions(basis)) {
    for (const path of await comparisonPaths(rule, map, target)) {
      const result = await rule.inspect(path, target.tip, target.branchTip);
      if (!result.passes) failures.push({ target, result });
    }
  }
  return { findings: [...map.findings], failures, parked: map.parked };
}

async function comparisonPaths(rule: WindowReadRule, map: WindowReadMap, target: WindowComparisonRevision): Promise<string[]> {
  const paths = new Set(await rule.paths(target.tip)), bases = new Set<string>();
  for (const read of map.readRevisions) for (const base of await rule.mergeBases(target.tip, read)) bases.add(base);
  if (target.branchTip) for (const base of await rule.mergeBases(target.tip, map.main)) bases.add(base);
  for (const base of bases) for (const path of await rule.paths(base)) paths.add(path);
  return [...paths].sort();
}

function trackedRecordFinding(result: WindowPathRule, target: WindowComparisonRevision): WindowFinding {
  return { subject: `${target.ref} (${target.tip})`,
    condition: `Tracked state ${result.workUnit === null ? "" : `for work unit ${result.workUnit} `}at ${result.path} differs from the import read ${result.readCopyRef ?? "(unavailable)"} and its allowed inherited content.`,
    remedy: target.branchTip
      ? "Re-apply the change on its read copy or drop it from this branch; land shared changes on main and merge main here, then retry check."
      : "Merge main into the read copy's branch, keeping a parked branch's side at its pointer and meta, then push and retry check.",
  };
}

function comparisonRevisions(basis: WindowTrackedRecordBasis): WindowComparisonRevision[] {
  const revisions = [{ ref: "refs/heads/main", tip: basis.main, branchTip: false }];
  for (const branch of basis.branches) {
    if (branch === "main") continue;
    for (const side of ["local", "origin"] as const) {
      const tip = basis[side][branch];
      if (tip) revisions.push({ ref: `${side === "local" ? "refs/heads/" : "refs/remotes/origin/"}${branch}`, tip, branchTip: true });
    }
  }
  return revisions;
}
