/** Validate exact Owner-supplied tips for every side of a held late-change range. */
import type { WindowComparisonRange } from "./comparison-marks.js";
import type { WindowFinding } from "./result.js";
/** Explicit tips from the confirmation command, keyed by branch side. */
export type WindowConfirmationTips = Partial<Record<"local" | "origin", string>>;
/** Require every range's current mark and reject side operands that have no range. */
export function windowConfirmationFindings(branch: string, ranges: readonly Pick<WindowComparisonRange, "side" | "tip">[],
  tips: WindowConfirmationTips): WindowFinding[] {
  const remedy = "Run compare for a changed branch and supply every range's exact --local-tip or --origin-tip; unchanged branches need no confirmation.";
  if (!ranges.length) return [{ subject: branch, condition: "This branch has no range to confirm.", remedy }];
  const findings: WindowFinding[] = [];
  for (const side of ["local", "origin"] as const) {
    const range = ranges.find(entry => entry.side === side), tip = tips[side];
    if (range === undefined && tip !== undefined) findings.push({ subject: `${side}/${branch}`, condition: `There is no ${side} range to confirm.`, remedy });
    else if (range !== undefined && tip !== range.tip) findings.push({ subject: `${side}/${branch}`,
      condition: `The supplied tip ${tip ?? "(missing)"} differs from the current mark ${range.tip}.`, remedy });
  }
  return findings;
}
