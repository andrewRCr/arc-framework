/** Compare today's Candidate readers and the exact records behind their supersession links. */
import { parseCandidateManagedRecord, type CandidateSupersessionAncestor } from "../../lib/work-unit/candidate-attestation.js";
import { readRepositoryCandidateSupersessionChain } from "../../lib/work-unit/candidate-record-store.js";
import type { MigrateReport } from "../../lib/store/commands.js";
import type { Store, HistoryEntry } from "../../lib/store/contract.js";
import type { RecordReference } from "../../lib/store/identity.js";
import type { WindowImportContext } from "./import-context.js";
import type { WindowFinding } from "./result.js";
import { canonicalWindowCandidate, compareWindowCandidateHistory } from "./chain-history.js";
import { canonicalize } from "../../lib/kernel/canonical/canonical-json.js";

/** One Candidate's actual tracked import coordinate. */
export interface WindowCandidateSource { path: string; revision: string; reference: RecordReference }
/** Reader success and refusal remain distinct on each side. */
export type WindowCandidateWalk = { status: "ok"; links: readonly CandidateSupersessionAncestor[] }
  | { status: "refused"; condition: string };
/** Complete per-Candidate comparison output. */
export interface WindowCandidateComparison { workUnit: string; equal: boolean; repository: WindowCandidateWalk; imported: WindowCandidateWalk; findings: WindowFinding[]; listed: { subject: string; condition: string }[] }

/** Read the source's immutable Candidate content. */
export async function readWindowCandidateContent(context: WindowImportContext, source: Pick<WindowCandidateSource, "path" | "revision">): Promise<string> {
  return (await context.exec("git", ["--no-replace-objects", "show", `${source.revision}:${source.path}`],
    { cwd: context.checkoutRoot, objectAccess: "local-only", preserveOutput: true })).stdout;
}

/** Walk through the same reader with an optional explicit off-branch owner. */
async function walk(context: WindowImportContext, source: WindowCandidateSource, content: string | null,
  stored?: { store: Store; reference: RecordReference }): Promise<WindowCandidateWalk> {
  const record = content === null ? null : parseCandidateManagedRecord(content);
  if (record === null || record.attestation.workUnit !== source.reference.owner.name) return { status: "refused", condition: "Today's Candidate reader refuses the absent or malformed current record." };
  try {
    const links = await readRepositoryCandidateSupersessionChain({ cwd: context.checkoutRoot, workUnit: source.reference.owner.name,
      record, exec: (command, args, options) => context.exec(command, ["--no-replace-objects", ...args], options), revision: source.revision,
      ...stored ? { store: stored.store, workItem: stored.reference.owner } : {} });
    return { status: "ok", links };
  } catch (error) { return { status: "refused", condition: error instanceof Error ? error.message : String(error) }; }
}

/** Compare current records, semantic links and each linked version without discarding any record fields. */
export async function compareWindowCandidate(context: WindowImportContext, store: Store, source: WindowCandidateSource,
  reference: RecordReference, report: MigrateReport): Promise<WindowCandidateComparison> {
  const content = await readWindowCandidateContent(context, source), current = await store.read({ reference });
  const repository = await walk(context, source, content);
  const imported = await walk(context, source, current.status === "ok" ? current.result.content : null, { store, reference });
  const result: WindowCandidateComparison = { workUnit: source.reference.owner.name, equal: true, repository, imported,
    findings: [], listed: report.reviewMapping.filter(entry => matchesSource(source, entry.source))
      .map(entry => ({ subject: entry.source, condition: `Import report: ${entry.outcome}${entry.reason ? `: ${entry.reason}` : ""}.` })) };
  const leftCurrent = report.reviewMapping.some(entry => entry.source === source.path && entry.outcome === "left-behind");
  compareCurrent(source, content, current, leftCurrent, result);
  if (repository.status !== "ok" || imported.status !== "ok") compareRefusals(source, report, leftCurrent, result);
  else result.findings.push(...await compareLinks(context, store, source, reference, repository.links, imported.links));
  result.findings.push(...await compareWindowCandidateHistory(context, store, source, reference, content, report));
  result.equal &&= result.findings.length === 0;
  return result;
}

function matchesSource(source: WindowCandidateSource, key: string): boolean {
  return key === source.path || key.startsWith(`${source.path}@`);
}

function compareCurrent(source: WindowCandidateSource, content: string, current: Awaited<ReturnType<Store["read"]>>,
  leftCurrent: boolean, result: WindowCandidateComparison): void {
  if (current.status === "ok" && canonicalWindowCandidate(content) === canonicalWindowCandidate(current.result.content)) return;
  result.equal = false;
  const changed = { subject: source.path, condition: `Current record differs: repository ${content}; imported ${current.status === "ok" ? current.result.content : current.refusal.condition}.` };
  if (leftCurrent && current.status === "refused" && current.refusal.code === "not-found") result.listed.push(changed);
  else result.findings.push(difference(changed.subject, changed.condition));
}

function compareRefusals(source: WindowCandidateSource, report: MigrateReport, leftCurrent: boolean, result: WindowCandidateComparison): void {
  result.equal = false;
  const broken = report.brokenChains.some(entry => entry.reference.kind === source.reference.kind && entry.reference.owner.name === source.reference.owner.name);
  const changed = { subject: source.path, condition: `Chain reader outcomes: repository ${JSON.stringify(result.repository)}; imported ${JSON.stringify(result.imported)}.` };
  if (result.repository.status === "refused" && (broken || leftCurrent)) result.listed.push({ ...changed,
    condition: `${broken ? "Import report lists a broken chain" : "Import report left the current version behind"}. ${changed.condition}` });
  else result.findings.push(difference(changed.subject, changed.condition));
}

function semantic(links: readonly CandidateSupersessionAncestor[]): string {
  return canonicalize(links.map(link => { const result = { ...link }; delete result.recordRevision; return result; }));
}

async function compareLinks(context: WindowImportContext, store: Store, source: WindowCandidateSource, reference: RecordReference,
  left: readonly CandidateSupersessionAncestor[], right: readonly CandidateSupersessionAncestor[]): Promise<WindowFinding[]> {
  if (semantic(left) !== semantic(right)) return [difference(source.path, "Supersession links differ between repository and imported history.")];
  if (!left.length) return [];
  const history = await store.history({ reference });
  return history.status === "ok" ? linkedRecordFindings(context, source, left, right, history.result)
    : [difference(source.path, history.refusal.condition)];
}

async function linkedRecordFindings(context: WindowImportContext, source: WindowCandidateSource,
  left: readonly CandidateSupersessionAncestor[], right: readonly CandidateSupersessionAncestor[], history: readonly HistoryEntry[]): Promise<WindowFinding[]> {
  const findings: WindowFinding[] = [];
  for (const [index, link] of left.entries()) {
    const revision = link.recordRevision, version = right[index]?.recordRevision;
    const stored = history.find(entry => entry.version === version)?.content;
    if (!revision || !version || stored == null) { findings.push(difference(source.path, "A linked record revision is unavailable.")); continue; }
    const content = await readWindowCandidateContent(context, { path: source.path, revision });
    if (canonicalWindowCandidate(content) !== canonicalWindowCandidate(stored))
      findings.push(difference(`${source.path}@${revision}`, `Linked record differs from imported version ${version}.`));
  }
  return findings;
}

function difference(subject: string, condition: string): WindowFinding {
  return { subject, condition, remedy: "Preserve the source and imported histories, resolve this unlisted difference, then retry chain or abort through restore." };
}
