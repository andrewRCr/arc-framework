/** One-time tracked-source transform behind the explicit migration entry. */
import { randomUUID } from "node:crypto";
import type { RefBackendContext } from "../context.js";
import type { StoreMigrateInput, StoreMigrateResult, MigrateReport } from "../../commands.js";
import { RepositoryGitCommonStatePublisher } from "../../../git-common-state.js";
import { readRepositoryIdentity, resolveRepositoryIdentity } from "../../../../scripts/review-gate/hosts/local/git-common-state.js";
import { RecordReferenceSchema } from "../../identity.js";
import { readImportSource } from "./source.js";
import { prepareImportRecords, buildImportCommits } from "./build.js";
import { writeRefRepository } from "../repository.js";
import { updateRefTransaction } from "../../../git/ref-transaction.js";
import { readSyncRefs } from "../sync-graph.js";
import type { Store } from "../../contract.js";
import { inspectImportDestination } from "./occupied.js";

/** Build a complete report before any destination ref or repository identity is published. */
export async function importTrackedState(context: RefBackendContext, store: Store, input: StoreMigrateInput): Promise<StoreMigrateResult> {
  if (!context.importSource) throw new Error("The import source must be bound by the store composition point");
  const report: MigrateReport = { move: "import", refs: [], refused: [], brokenChains: [], reviewMapping: [], differingNotes: [], notices: [] };
  const publisher = new RepositoryGitCommonStatePublisher(context.exec, context.checkoutRoot);
  const existingId = await readRepositoryIdentity(publisher);
  const occupied = await inspectImportDestination(context, store, existingId);
  if (occupied.status === "refused") return occupied;
  if (occupied.result) return { status: "ok", result: report };
  const codeHead = (await context.exec("git", ["rev-parse", "HEAD"], { cwd: context.checkoutRoot })).stdout.trim();
  const records = prepareImportRecords(context, await readImportSource(context, report, codeHead), report);
  const blocked = report.refused.length > 0 || report.notices.length > 0;
  if (existingId === null) report.notices.push({ condition: "The landing would mint the repository identity ID." });
  if (blocked) return input.trial ? { status: "ok", result: report } : importRefused(report);
  const projectId = input.trial ? existingId ?? randomUUID() : await resolveRepositoryIdentity(publisher);
  const identity = prepareImportRecords(context, [{ reference: RecordReferenceSchema.parse({ kind: "project-registry/identity", owner: { type: "project", name: "project", uid: projectId } }),
    content: JSON.stringify({ projectId }) }], report);
  if (!identity.length) return importRefused(report);
  records.push(...identity);
  report.refs.push({ ref: "refs/arc/project/registry", scope: "project", action: "create" });
  const physical = await writeRefRepository(context);
  const refs = await buildImportCommits(physical, records, codeHead, randomUUID());
  const gathered = new Map([...refs].map(([ref, next]) => [`refs/arc/tmp/migrate/import/${ref.slice("refs/arc/".length)}`, next]));
  const held = await readSyncRefs(physical, "refs/arc/tmp/migrate/import/");
  const gathering = await updateRefTransaction(physical, [...gathered].map(([ref, next]) => ({ ref, next, expected: held.get(ref) ?? null })), { cwd: context.checkoutRoot });
  if (gathering.status !== "committed") throw new Error("The private import build changed unexpectedly");
  const release = await context.lock("layout");
  try {
    const changes = [...gathered].map(([ref, expected]) => ({ ref, expected, delete: true as const }));
    const landed = await updateRefTransaction(physical, input.trial ? changes : [
      ...[...refs].map(([ref, next]) => ({ ref, next, expected: null })), ...changes,
    ], { cwd: context.checkoutRoot });
    if (landed.status !== "committed") return importRefused(report);
  } finally { await release(); }
  return { status: "ok", result: report };
}

function importRefused(report: MigrateReport): StoreMigrateResult {
  return { status: "refused", refusal: { code: "import-refused", class: "recoverable", report,
    condition: "The import cannot land every source record.", remedy: { text: "Repair the reported source records and retry arc store migrate --import." } } };
}
