/** Reconstruct comparison ranges from held marks, independently of later live branch tips. */
import type { WindowHoldIO, WindowRecord } from "./hold.js";
import { readWindowUnrecordedBase } from "./branch-observations.js";
import { windowComparisonRange, type WindowComparisonMark, type WindowComparisonRange } from "./comparison-marks.js";

/** A comparison ref with the confirmation currently bound to its branch side. */
export interface WindowHeldMark extends WindowComparisonMark { ref: string; confirmation: string | null }
/** A nonempty late-change range with its exact comparison and confirmation refs. */
export interface WindowHeldRange extends WindowComparisonRange { ref: string; confirmationRef: string; confirmation: string | null }
/** Complete mark and range inventory for all branches or one confirmation target. */
export interface WindowHeldComparisons { marks: WindowHeldMark[]; ranges: WindowHeldRange[] }

/** Read only immutable held tips; later movement on a branch does not silently move its range. */
export async function readWindowHeldComparisons(io: WindowHoldIO, record: WindowRecord, held: ReadonlyMap<string, string>,
  branch?: string): Promise<WindowHeldComparisons> {
  const marks: WindowHeldMark[] = [], ranges: WindowHeldRange[] = [];
  for (const [ref, tip] of held) {
    const parsed = parseMarkRef(ref);
    if (parsed === null || branch !== undefined && parsed.branch !== branch) continue;
    const { side, kind, branch: name } = parsed;
    const recorded = record.branches.live[name]?.[side] ?? null;
    const base = recorded ?? await readWindowUnrecordedBase(io, record, name, tip);
    const confirmationRef = `refs/arc-window/confirmed/${side}/${name}`, confirmation = held.get(confirmationRef) ?? null;
    const mark: WindowHeldMark = { branch: name, side, kind, tip, recorded, base, ref, confirmation };
    marks.push(mark);
    const range = windowComparisonRange(mark);
    if (range !== null) ranges.push({ ...range, ref, confirmationRef, confirmation });
  }
  return { marks, ranges };
}

function parseMarkRef(ref: string): Pick<WindowComparisonMark, "kind" | "side" | "branch"> | null {
  for (const kind of ["compared", "gone"] as const) {
    for (const side of ["local", "origin"] as const) {
      const prefix = `refs/arc-window/${kind}/${side}/`;
      if (ref.startsWith(prefix)) return { kind, side, branch: ref.slice(prefix.length) };
    }
  }
  return null;
}
