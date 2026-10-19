/** Exact source accounting for the review mapping's externally supplied listing. */
import type { MigrateReport } from "../../commands.js";

/** Diagnose a missing or repeated source without depending on any review record's shape. */
export function inspectReviewCoverage(sources: readonly string[], listing: MigrateReport["reviewMapping"]): MigrateReport["notices"] {
  const notices = sources.flatMap(source => {
    const count = listing.filter(item => item.source === source).length;
    return count === 1 ? [] : [{ condition: `Review source ${source} is covered ${count} times by the mapping.`,
      remedy: { text: "Correct the review mapping to account for every source exactly once, then retry arc store migrate --import." } }];
  });
  const expected = new Set(sources);
  for (const source of new Set(listing.map(item => item.source))) {
    if (!expected.has(source)) notices.push({ condition: `Review mapping lists a source it was not given: ${source}.`,
      remedy: { text: "Correct the review mapping to account for every source exactly once, then retry arc store migrate --import." } });
  }
  return notices;
}
