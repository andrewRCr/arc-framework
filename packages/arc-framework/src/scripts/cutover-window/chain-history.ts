/** Compare the complete singleton Candidate history with the import's accepted plain path log. */
import { canonicalize } from "../../lib/kernel/canonical/canonical-json.js";
import { readImportCandidateVersions } from "../../lib/store/ref/import/candidate.js";
import type { MigrateReport } from "../../lib/store/commands.js";
import type { Store } from "../../lib/store/contract.js";
import type { RecordReference } from "../../lib/store/identity.js";
import type { WindowImportContext } from "./import-context.js";
import type { WindowFinding } from "./result.js";

/** Preserve every parsed field; legacy malformed JSON remains exact raw content. */
export function canonicalWindowCandidate(content: string): string {
  try { return `json:${canonicalize(JSON.parse(content))}`; }
  catch { return `raw:${content}`; }
}

/** History omits consecutive unchanged versions, but retains repeated content after a change. */
export function windowCandidateHistory(contents: readonly string[]): string[] {
  const versions: string[] = [];
  for (const content of contents) {
    const canonical = canonicalWindowCandidate(content);
    if (versions.at(-1) !== canonical) versions.push(canonical);
  }
  return versions;
}

/** Verify complete accepted versions, including transitions outside the current supersession chain. */
export async function compareWindowCandidateHistory(context: WindowImportContext, store: Store,
  source: { path: string; revision: string; reference: RecordReference }, reference: RecordReference,
  current: string, report: MigrateReport): Promise<WindowFinding[]> {
  const strictContext = { ...context, importSource: { ...context.importSource, ports: { ...context.importSource.ports,
    exec: ((command, args, options) => context.exec(command, ["--no-replace-objects", ...args], options)) as WindowImportContext["exec"] } } };
  const versions = await readImportCandidateVersions(strictContext, source.reference.owner.name, source.revision);
  const omitted = new Set(report.reviewMapping.filter(entry => entry.outcome === "left-behind").map(entry => entry.source));
  const contents = versions.filter(entry => !omitted.has(`${source.path}@${entry.commit}`)).map(entry => entry.content);
  if (!omitted.has(source.path)) contents.push(current);
  const expected = windowCandidateHistory(contents), history = await store.history({ reference });
  if (history.status !== "ok") {
    if (!expected.length && history.refusal.code === "not-found") return [];
    return [historyDifference(source.path, history.refusal.condition)];
  }
  const actual = history.result.slice().reverse().map(entry => entry.content);
  if (actual.some(content => content === null)) return [historyDifference(source.path, "Imported history contains a deletion absent from the source replay.")];
  return canonicalize(expected) === canonicalize(windowCandidateHistory(actual as string[])) ? []
    : [historyDifference(source.path, `Complete Candidate history differs: expected ${expected.length} accepted versions; imported ${actual.length}.`)];
}

function historyDifference(subject: string, condition: string): WindowFinding {
  return { subject, condition, remedy: "Preserve both histories, resolve this unlisted history difference, then retry chain or abort through restore." };
}
