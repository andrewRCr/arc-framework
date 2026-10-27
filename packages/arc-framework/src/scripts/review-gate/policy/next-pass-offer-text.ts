/** Advisory considerations rendered from the shared computed next-pass facts. */
import type { NextPassFacts } from "./next-pass-facts-schema.js";

type Size = NextPassFacts["rangeSize"]["target"];
function sizeText(size: Size | null): string {
  if (size === null) return "unavailable";
  if (size.kind === "unknown") return `unknown (${size.reason})`;
  return `${size.metrics.lines} changed lines in ${size.metrics.files} ${size.metrics.files === 1 ? "file" : "files"}`;
}
function signalText(signal: boolean | null): string { return signal === null ? "unknown" : signal ? "yes" : "no"; }

/**
 * Name each ordered trend entry's lane position, its complete pass or its fix-check round since one, and the complete
 * pass it follows; a look before any complete pass follows pass 0.
 */
export function materialTrendEntries(
  facts: NextPassFacts,
): (NextPassFacts["materialTrend"][number] & { position: string; pass: number })[] {
  let completePass = 0;
  let round = 0;
  const positions = new Map<string, { position: string; pass: number }>();
  return facts.materialTrend.map(look => {
    let placed = positions.get(look.producerId);
    if (placed === undefined) {
      if (look.coverage === "complete") {
        completePass += 1;
        round = 0;
        placed = { position: `complete pass ${completePass} of ${facts.ceiling}`, pass: completePass };
      } else {
        round += 1;
        placed = { position: `fix check, round ${round} since pass ${completePass}`, pass: completePass };
      }
      positions.set(look.producerId, placed);
    }
    return { ...look, ...placed };
  });
}

/** Render the ordered material trend with complete-pass counts and fix-check rounds. */
export function materialTrendText(facts: NextPassFacts): string {
  return materialTrendEntries(facts).map(look =>
    `${look.position}: ${look.outcome}, ${look.materialCount ?? "unknown"} material${look.provisional ? " (provisional)" : ""}`,
  ).join("; ");
}

/** Render each observation with its limits and the decision it can inform. */
export function nextPassConsiderations(facts: NextPassFacts): readonly string[] {
  const checks = facts.fixChecksSinceLastComplete.map((look, index) => `round ${index + 1}: ${look.outcome}`).join(", ");
  const trend = materialTrendText(facts);
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
