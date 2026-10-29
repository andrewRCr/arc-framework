/** Compose migration ref actions and notices without depending on copy execution. */
import type { MigrateReport } from "../commands.js";

/** Report actions and remedies once even when a leased round is retried. */
export function appendCleanupReport(report: MigrateReport, addition: Pick<MigrateReport, "refs" | "notices">): void {
  appendUnique(report.refs, addition.refs);
  appendUnique(report.notices, addition.notices);
}

function appendUnique<T>(target: T[], addition: readonly T[]): void {
  const known = new Set(target.map(row => JSON.stringify(row)));
  for (const row of addition) {
    const key = JSON.stringify(row);
    if (!known.has(key)) { target.push(row); known.add(key); }
  }
}

/** Describe the copied state, including identity scope and withdrawn destination controls. */
export function remoteCopyReport(planned: ReadonlyMap<string, string>, destination: ReadonlyMap<string, string>, notices: MigrateReport["notices"]): MigrateReport {
  const refs: MigrateReport["refs"] = [...planned].map(([ref]) => {
    const person = /^refs\/arc\/user\/([^/]+)\//u.exec(ref)?.[1];
    return { ref, ...person ? { scope: "identity" as const, person } : { scope: "project" as const }, action: destination.has(ref) ? "merge" : "copy" };
  });
  for (const ref of destination.keys()) if (!planned.has(ref)) refs.push({ ref, scope: "project", action: "delete" });
  return { move: "remote", refs, refused: [], brokenChains: [], reviewMapping: [], differingNotes: [], notices };
}
