/** Advisory considerations rendered from the shared computed next-pass facts. */
import type { NextPassFacts } from "./next-pass-facts-schema.js";

type Size = NextPassFacts["rangeSize"]["target"];
function sizeText(size: Size | null): string {
  if (size === null) return "unavailable";
  if (size.kind === "unknown") return `unknown (${size.reason})`;
  return `${size.metrics.lines} changed lines in ${size.metrics.files} ${size.metrics.files === 1 ? "file" : "files"}`;
}
function signalText(signal: boolean | null): string { return signal === null ? "unknown" : signal ? "yes" : "no"; }

/** Render each observation with its limits and the decision it can inform. */
export function nextPassConsiderations(facts: NextPassFacts): readonly string[] {
  const checks = facts.fixChecksSinceLastComplete.map(look => `${look.logicalPass}: ${look.outcome}`).join(", ");
  const trend = facts.materialTrend.map(look => `${look.coverage === "complete" ? "complete pass" : "fix check"} `
    + `${look.logicalPass}: ${look.outcome}, ${look.materialCount ?? "unknown"} material${look.provisional ? " (provisional)" : ""}`).join("; ");
  return [
    `Complete passes: ${facts.completePasses} of ${facts.ceiling}. A complete pass spends this budget; a fix check does not. `
      + "A tight budget favors verifying repairs in a fix check, preserving complete passes for a successor look when the defect signal justifies one. "
      + "At the ceiling, another complete pass needs the Owner’s override.",
    `Fix checks since the last complete pass: ${facts.fixChecksSinceLastComplete.length}${checks === "" ? "" : ` (${checks})`}. `
      + "Their results show repair convergence; material fixes remaining favor another fix check before a successor pass is considered.",
    `Fix range: ${sizeText(facts.rangeSize.fix)}; target: ${sizeText(facts.rangeSize.target)}. `
      + "When the chain is proven, a smaller fix range favors a fix check; a broad range supports considering a complete pass after fix checks converge.",
    `Correction chain: ${facts.chainProven ? "proven" : "unproven"}. A proven chain gives the fix check its exact scope; `
      + "an unproven chain admits only a complete pass and calls for checking why.",
    ...facts.fixRounds.flatMap((round, index) => [
      `Round ${index + 1}, paths outside cited loci: ${signalText(round.outsideCitedLoci)}. `
        + "This is a path heuristic: changes beyond the cited files may be new design and favor a complete pass after fix checks converge.",
      `Round ${index + 1}, added files: ${signalText(round.addedFiles)}. `
        + "New files may introduce new design and favor a complete pass after fix checks converge; absence alone does not establish local correction.",
    ]),
    `Material trend: ${trend === "" ? "no completed looks" : trend}. `
      + "New defect classes still appearing in previously read code favor another complete pass after fix checks converge. "
      + "No new defect classes and only local corrections favor stopping; falling counts alone do not establish that. Prefer a different source for a successor pass.",
  ];
}
