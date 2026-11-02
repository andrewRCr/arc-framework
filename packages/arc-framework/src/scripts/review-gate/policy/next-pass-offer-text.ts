/** Advisory considerations rendered from the shared computed next-pass facts. */
import type { NextPassFacts } from "./next-pass-facts-schema.js";
import type { ReviewRetrigger } from "./routing-schema.js";

type Size = NextPassFacts["rangeSize"]["target"];
function sizeText(size: Size | null): string {
  if (size === null) return "unavailable";
  if (size.kind === "unknown") return `unknown (${size.reason})`;
  return `${size.metrics.lines} changed lines in ${size.metrics.files} ${size.metrics.files === 1 ? "file" : "files"}`;
}

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

/** One entry per look, in lane order; the current look's proposed count replaces its recorded one. */
export function trendLooks(facts: NextPassFacts): ReturnType<typeof materialTrendEntries> {
  const looks = new Map<string, ReturnType<typeof materialTrendEntries>[number]>();
  for (const entry of materialTrendEntries(facts)) looks.set(entry.producerId, entry);
  return [...looks.values()];
}

/**
 * Each complete pass with the fix checks after it, as one series of critical and major counts per look, marking the
 * current look; empty when no look found a critical or major finding.
 */
export function criticalMajorSeries(facts: NextPassFacts): string[] {
  const looks = trendLooks(facts);
  if (looks.every(look => look.materialCount === 0)) return [];
  const passes = new Map<number, string[]>();
  for (const look of looks) {
    const counts = passes.get(look.pass) ?? [];
    counts.push(`${look.materialCount ?? "unknown"}${look.provisional ? " (this look)" : ""}`);
    passes.set(look.pass, counts);
  }
  return [...passes].map(([pass, counts]) =>
    `${pass === 0 ? "Before pass 1" : `Pass ${pass} of ${facts.ceiling}`}: ${counts.join(" → ")}`);
}

/** Render the critical and major counts the way the disposition report's Trend does. */
function criticalMajorText(facts: NextPassFacts): string {
  if (facts.materialTrend.length === 0) return "no completed looks";
  const series = criticalMajorSeries(facts);
  return series.length === 0 ? "none at any look" : series.join("; ");
}

/** Name each fix round by the look whose findings it fixed, listing only the change signals that fired or are unknown. */
function changeSignalText(facts: NextPassFacts): string {
  const positions = new Map(materialTrendEntries(facts).map(look => [look.producerId, look.position]));
  const noted = facts.fixRounds.flatMap(round => {
    const signals = [
      round.outsideCitedLoci === true ? "changed paths outside the cited loci" : undefined,
      round.addedFiles === true ? "added files" : undefined,
      round.outsideCitedLoci === null || round.addedFiles === null ? "left a signal unknown" : undefined,
    ].filter(signal => signal !== undefined);
    return signals.length === 0 ? []
      : [`after ${positions.get(round.producerId) ?? "an earlier look"}, the fixes ${signals.join(" and ")}`];
  });
  const quiet = facts.fixRounds.length - noted.length;
  const rounds = `${quiet}${noted.length === 0 ? "" : " other"} fix round${quiet === 1 ? "" : "s"}`;
  return [...noted, ...(quiet === 0 ? [] : [`no signal fired after ${rounds}`])].join("; ");
}

/**
 * Name the latest complete pass's critical and major count, then what it informs. Under `full-final`, another complete
 * pass is the default until one finds none, since a converged fix check shows only that its repairs hold; other
 * policies close the lane on a converged fix-check chain, so a further complete pass is the Owner's to direct.
 */
function successorDefaultText(facts: NextPassFacts, retrigger: ReviewRetrigger): string {
  const last = trendLooks(facts).filter(look => look.coverage === "complete").at(-1);
  if (last?.materialCount === 0) {
    const met = `Complete pass ${String(last.pass)} found none, which meets the review's bar.`;
    return retrigger === "full-final"
      ? `${met} If later repairs make that assessment cease to hold, another complete pass is due under the re-inspection test.`
      : met;
  }
  const found = last === undefined || last.materialCount === null ? ""
    : `Complete pass ${String(last.pass)} found ${String(last.materialCount)}. `;
  const repairs = `${found}Fix checks show whether repairs hold, not what a complete pass missed`;
  if (retrigger !== "full-final") {
    return `${repairs}. This lane's policy closes it once the fix-check chain converges; a further complete pass runs `
      + "only if the Owner directs one.";
  }
  return `${repairs}, so until a complete pass finds no critical or major finding, another complete pass after `
    + "fix checks converge is the default. Recommending a stop before then needs a reason specific to this change. "
    + "An Owner's decision on where review stops ends this default.";
}

/** Render each observation with its limits and the decision it can inform. */
export function nextPassConsiderations(facts: NextPassFacts, retrigger: ReviewRetrigger): readonly string[] {
  const checks = facts.fixChecksSinceLastComplete.map((look, index) => `round ${index + 1}: ${look.outcome}`).join(", ");
  const followingPass = retrigger === "full-final" ? "a complete pass after fix checks converge"
    : "an additional complete pass the Owner directs once fix checks converge";
  return [
    `Complete passes: ${facts.completePasses} of ${facts.ceiling}. A complete pass spends this budget; a fix check does not. `
      + "A tight budget favors verifying repairs in a fix check, preserving complete passes for a successor look when the defect signal justifies one. "
      + "At the ceiling, another complete pass needs the Owner’s override.",
    `Fix checks since the last complete pass: ${facts.fixChecksSinceLastComplete.length}${checks === "" ? "" : ` (${checks})`}. `
      + "Their results show repair convergence; material fixes remaining favor another fix check before a successor pass is considered.",
    `Fix range: ${sizeText(facts.rangeSize.fix)}; target: ${sizeText(facts.rangeSize.target)}. `
      + `When the chain is proven, a smaller fix range favors a fix check; a broad range supports considering ${followingPass}.`,
    `Correction chain: ${facts.chainProven ? "proven" : "unproven"}. A proven chain gives the fix check its exact scope; `
      + "an unproven chain admits only a complete pass and calls for checking why.",
    ...(facts.fixRounds.length === 0 ? [] : [`Change signals after fixes: ${changeSignalText(facts)}. `
      + "Paths changed outside the cited files are a heuristic for new design, and new files may introduce it too; "
      + `either favors ${followingPass}, and their absence alone does not establish local correction.`]),
    `Critical and major findings: ${criticalMajorText(facts)}. ${successorDefaultText(facts, retrigger)}`
      + (retrigger === "full-final" ? " Prefer a different source for a successor pass." : ""),
  ];
}
