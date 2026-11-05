/** One-time tracked-source transform behind the explicit migration entry. */
import { randomUUID } from "node:crypto";
import type { RefBackendContext } from "../context.js";
import type { StoreMigrateInput, StoreMigrateResult, MigrateReport } from "../../commands.js";
import { RepositoryGitCommonStatePublisher } from "../../../git-common-state.js";
import { readRepositoryIdentity, resolveRepositoryIdentity } from "../../../../scripts/review-gate/hosts/local/git-common-state.js";
import { RecordReferenceSchema } from "../../identity.js";
import { readImportSource, type ImportCandidateSource, type ImportRecord } from "./source.js";
import { prepareImportRecords, prepareImportCandidateSources, buildImportCommits } from "./build.js";
import { readRefRepository, writeRefRepository } from "../repository.js";
import type { Store } from "../../contract.js";
import { inspectImportDestination } from "./occupied.js";
import { publishImport } from "./finish.js";
import { landImportRefs, type ImportLandingOutcome } from "./land.js";
import { keepImportPublication } from "./transient-publication.js";
import { keepImportTransients, importTransientDeletes } from "./transient-cleanup.js";
import { prepareImportCodeLinks, qualifyImportCodeLinks } from "./code-links.js";
import { mapImportReview } from "./review-mapping.js";

/** Build a complete report before any destination ref or repository identity is published. */
export async function importTrackedState(context: RefBackendContext, store: Store, input: StoreMigrateInput): Promise<StoreMigrateResult> {
  if (!context.importSource) throw new Error("The import source must be bound by the store composition point");
  const report: MigrateReport = { move: "import", refs: [], refused: [], brokenChains: [], reviewMapping: [], differingNotes: [], notices: [] };
  const publisher = new RepositoryGitCommonStatePublisher(context.exec, context.checkoutRoot);
  const existingId = await readRepositoryIdentity(publisher);
  const occupied = await inspectImportDestination(context, store, existingId);
  if (occupied.status === "refused") return occupied;
  if (occupied.result) return input.trial ? { status: "ok", result: report } : publishImport(context, store, report);
  await context.migrateStep?.("import.build");
  const codeHead = (await context.exec("git", ["rev-parse", "HEAD"], { cwd: context.checkoutRoot })).stdout.trim();
  const transients = { tips: new Map<string, string>(), notices: [] as MigrateReport["notices"] };
  const informational: MigrateReport["notices"] = [];
  const proposedId = existingId ?? randomUUID();
  const source = await mapImportReview(context, await readImportSource(context, report, codeHead, transients, informational), report, proposedId);
  const records = prepareImportRecords(context, source.records, report);
  const candidates = prepareImportCandidateSources(context, source.candidates, report);
  const skipped: MigrateReport["notices"] = [];
  await prepareImportCodeLinks(context, records, report, skipped);
  const blocked = report.refused.length > 0 || report.notices.length > 0;
  report.notices.push(...transients.notices, ...skipped, ...informational);
  if (existingId === null) report.notices.push({ condition: "The landing would mint the repository identity ID." });
  if (blocked) return input.trial ? { status: "ok", result: report } : importRefused(report);
  const projectId = input.trial ? proposedId : await resolveRepositoryIdentity(publisher, () => proposedId);
  if (reviewIdentityChanged(context, report, proposedId, projectId)) return importRefused(report);
  qualifyImportCodeLinks(records, projectId);
  const identity = prepareImportRecords(context, [{ reference: RecordReferenceSchema.parse({ kind: "project-registry/identity", owner: { type: "project", name: "project", uid: projectId } }),
    content: JSON.stringify({ projectId }) }], report);
  if (!identity.length) return importRefused(report);
  records.push(...identity);
  if (!report.refs.some(({ ref }) => ref === "refs/arc/project/registry")) report.refs.push({ ref: "refs/arc/project/registry", scope: "project", action: "create" });
  return landImport(context, store, report, records, { codeHead, projectId, tips: transients.tips, trial: input.trial === true, candidates });
}

/** A trial drops its build, so it selects the repository by reading and never places a store directory. */
async function landImport(context: RefBackendContext, store: Store, report: MigrateReport, records: readonly ImportRecord[],
  landing: { codeHead: string; projectId: string; tips: ReadonlyMap<string, string>; trial: boolean;
    candidates: readonly ImportCandidateSource[] }): Promise<StoreMigrateResult> {
  const { codeHead, tips, trial, candidates } = landing;
  if (!trial) await keepImportTransients(context, tips);
  const physical = trial ? await readRefRepository(context) : await writeRefRepository(context);
  const refs = await buildImportCommits(physical, records, codeHead, randomUUID(), candidates);
  if (!trial && tips.size) await keepImportPublication(context, refs);
  const landed = await landImportRefs(physical, refs, trial, tips);
  if (landed.status !== "committed") return landingRace(context, store, report, landing, landed);
  return trial ? { status: "ok", result: report } : publishImport(context, store, report);
}

function reviewIdentityChanged(context: RefBackendContext, report: MigrateReport, proposed: string, actual: string): boolean {
  if (!context.reviewMapping || proposed === actual) return false;
  report.notices.push({ condition: "The repository identity changed while the review mapping was being built.",
    remedy: { text: "Retry arc store migrate --import against the established repository identity." } });
  return true;
}

async function landingRace(context: RefBackendContext, store: Store, report: MigrateReport,
  landing: { projectId: string; trial: boolean; tips: ReadonlyMap<string, string> },
  failure: Exclude<ImportLandingOutcome, { status: "committed" }>): Promise<StoreMigrateResult> {
  const occupied = await inspectImportDestination(context, store, landing.projectId);
  if (occupied.status === "refused") return occupied;
  if (occupied.result) return landing.trial ? { status: "ok", result: report } : publishImport(context, store, report);
  report.notices.push(landingRaceNotice(failure, landing.tips));
  return landing.trial ? { status: "ok", result: report } : importRefused(report);
}

function landingRaceNotice(failure: Exclude<ImportLandingOutcome, { status: "committed" }>,
  tips: ReadonlyMap<string, string>): MigrateReport["notices"][number] {
  if (failure.status === "lost-race") {
    const deletions = new Map(importTransientDeletes(tips).map(change => [change.ref, change.expected] as const));
    const lost = failure.refs.filter(row => deletions.get(row.ref) === row.expected);
    if (lost.length) return { condition: `The import lost its captured transient-source delete lease for ${lost.map(row => `${row.ref} (expected ${row.expected}, found ${row.actual ?? "absent"})`).join(", ")}.`,
      remedy: { text: "Reconcile the named local transient source refs, then retry arc store migrate --import to recapture their current state.",
        argv: ["arc", "store", "migrate", "--import"] } };
  }
  return { condition: "The import's private refs changed while its landing was being committed.",
    remedy: { text: "Retry arc store migrate --import to rebuild its private gathering refs.", argv: ["arc", "store", "migrate", "--import"] } };
}

function importRefused(report: MigrateReport): StoreMigrateResult {
  return { status: "refused", refusal: { code: "import-refused", class: "recoverable", report,
    condition: "The import cannot land every source record.", remedy: { text: "Repair the reported source records and retry arc store migrate --import." } } };
}
