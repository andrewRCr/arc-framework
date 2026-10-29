/** Exact file and folder accounting for the review mapping's externally supplied listing. */
import type { MigrateReport } from "../../commands.js";

type ReviewListing = MigrateReport["reviewMapping"][number];

/** Diagnose missing, repeated, overlapping, or unknown sources without knowing review record shapes. */
export function inspectReviewCoverage(sources: readonly string[], listing: MigrateReport["reviewMapping"]): MigrateReport["notices"] {
  const counts = new Map(sources.map(source => [source, 0]));
  const notices: MigrateReport["notices"] = [];
  const remedy = { text: "Correct the review mapping to account for every source exactly once, then retry arc store migrate --import." };
  for (const item of listing) {
    const covered = coveredSources(sources, item);
    if (!covered.length) notices.push({ condition: `Review mapping lists an unknown or invalid source: ${item.source}.`, remedy });
    for (const source of covered) counts.set(source, (counts.get(source) ?? 0) + 1);
  }
  for (const [source, count] of counts) {
    if (count !== 1) notices.push({ condition: `Review source ${source} is covered ${count} times by the mapping.`, remedy });
  }
  return notices;
}

function coveredSources(sources: readonly string[], item: ReviewListing): string[] {
  if (sources.includes(item.source)) return [item.source];
  if (!item.source.startsWith("arc/review-gate/materializations/") || !item.source.endsWith("/")
    || item.source.includes("\\") || item.outcome !== "left-behind" || !item.reason?.trim()) return [];
  const segments = item.source.slice(0, -1).split("/");
  if (segments.length !== 4 || segments.some(segment => !segment || segment === "." || segment === "..")) return [];
  return sources.filter(source => source.startsWith(item.source));
}
