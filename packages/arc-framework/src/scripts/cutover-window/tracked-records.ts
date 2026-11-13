/** Refuse committed tracked-state changes outside the import's selected read and inherited content. */
import type { WindowImportContext } from "./import-context.js";
import type { WindowRecord } from "./hold.js";
import { WindowRefusal, type WindowFinding } from "./result.js";
import type { ComposedLifecycleIndexResult } from "../../lib/work-unit/composed-lifecycle-index.js";
import { createWindowReadMap, type WindowReadMap } from "./read-map.js";
import { createWindowReadRule, type WindowReadRule, type WindowPathRule } from "./read-rule.js";

interface ComparisonRevision { ref: string; tip: string; branchTip: boolean }

/** Inspect main and both acquired sides of every live branch, retaining each affected revision and file. */
export async function readWindowTrackedRecordFindings(context: WindowImportContext, record: WindowRecord,
  composition: ComposedLifecycleIndexResult): Promise<WindowFinding[]> {
  const main = record.branches.local.main;
  if (!main) throw new WindowRefusal([{ subject: "main", condition: "The importing main revision is unavailable.",
    remedy: "Restore the importing main branch and retry check." }]);
  const map = await createWindowReadMap(context, main, composition), rule = createWindowReadRule(context, map);
  const findings = [...map.findings];
  for (const target of comparisonRevisions(record, main)) {
    for (const path of await comparisonPaths(rule, map, target)) {
      const result = await rule.inspect(path, target.tip, target.branchTip);
      if (!result.passes) findings.push(trackedRecordFinding(result, target));
    }
  }
  return findings;
}

async function comparisonPaths(rule: WindowReadRule, map: WindowReadMap, target: ComparisonRevision): Promise<string[]> {
  const paths = new Set(await rule.paths(target.tip)), bases = new Set<string>();
  for (const read of map.readRevisions) for (const base of await rule.mergeBases(target.tip, read)) bases.add(base);
  if (target.branchTip) for (const base of await rule.mergeBases(target.tip, map.main)) bases.add(base);
  for (const base of bases) for (const path of await rule.paths(base)) paths.add(path);
  return [...paths].sort();
}

function trackedRecordFinding(result: WindowPathRule, target: ComparisonRevision): WindowFinding {
  return { subject: `${target.ref} (${target.tip})`,
    condition: `Tracked state ${result.workUnit === null ? "" : `for work unit ${result.workUnit} `}at ${result.path} differs from the import read ${result.readCopyRef ?? "(unavailable)"} and its allowed inherited content.`,
    remedy: target.branchTip
      ? "Re-apply the change on its read copy or drop it from this branch; land shared changes on main and merge main here, then retry check."
      : "Merge main into the read copy's branch, keeping a parked branch's side at its pointer and meta, then push and retry check.",
  };
}

function comparisonRevisions(record: WindowRecord, main: string): ComparisonRevision[] {
  const revisions = [{ ref: "refs/heads/main", tip: main, branchTip: false }];
  for (const branch of new Set([...Object.keys(record.branches.live), record.flip.branch])) {
    if (branch === "main") continue;
    for (const side of ["local", "origin"] as const) {
      const tip = record.branches[side][branch];
      if (tip) revisions.push({ ref: `${side === "local" ? "refs/heads/" : "refs/remotes/origin/"}${branch}`, tip, branchTip: true });
    }
  }
  return revisions;
}
