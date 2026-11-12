/** Account historical copy effects without granting another publication on a retired target. */
import { z } from "zod";
import type { MigrateReport } from "../commands.js";
import type { RefBackendContext } from "./context.js";
import type { MoveRemote } from "./migrate-record.js";
import { readCopyJournal, recoverCopyJournal, transferCopyJournal, type CopyJournal } from "./migrate-copy-journal.js";
import { fetchMigrationRemote } from "./migrate-remote-fetch.js";
import { MigrationRefusal } from "./migrate-refusal.js";
import { appendCleanupReport } from "./migrate-report.js";

const ObservedRemoteSchema = z.strictObject({ name: z.string().min(1), repository: z.enum(["code", "backing"]),
  url: z.string().min(1), fetchUrl: z.string().min(1) });
const KeySchema = z.strictObject({ kind: z.enum(["remote", "follow", "leave-source"]), source: ObservedRemoteSchema,
  destination: ObservedRemoteSchema, generation: z.string().min(1).optional() });

/** Decode only the producer's observation identity; historical accounting never uses a push transport. */
export function copyAccountIdentity(held: CopyJournal): z.infer<typeof KeySchema> {
  return KeySchema.parse(JSON.parse(held.record.key));
}

/** Establish a historical outcome where possible, preserving unresolved evidence without blocking an explicit exit. */
export async function accountCopyJournal(context: RefBackendContext, report: MigrateReport, nextKey?: string): Promise<boolean> {
  let held = await readCopyJournal(context);
  if (!held) return false;
  if (held.record.attempt) held = await settleHistoricalCopy(context, held);
  appendCleanupReport(report, held.record.settled);
  if (held.record.attempt) appendUncertainCopy(report, held);
  await transferCopyJournal(context, held, report, nextKey);
  return true;
}

async function settleHistoricalCopy(context: RefBackendContext, held: CopyJournal): Promise<CopyJournal> {
  const destination = copyAccountIdentity(held).destination;
  const remote: MoveRemote = { ...destination, pushUrl: destination.fetchUrl };
  let refs: Map<string, string>;
  try { refs = await fetchMigrationRemote(context, remote, true); }
  catch (error) {
    if (error instanceof MigrationRefusal && error.refusal.code === "store" && error.refusal.refusal.code === "unreachable") return held;
    throw error;
  }
  try { await recoverCopyJournal(context, held.record.key, refs); }
  catch (error) { if (!(error instanceof MigrationRefusal) || error.refusal.code !== "move-unfinished") throw error; }
  const settled = await readCopyJournal(context);
  if (!settled) throw new Error("The pending copy account disappeared during settlement");
  return settled;
}

function appendUncertainCopy(report: MigrateReport, held: CopyJournal): void {
  const tip = held.refs.get("refs/arc/tmp/migrate/pending-copy/record"), destination = copyAccountIdentity(held).destination;
  const retained = `refs/arc/tmp/migrate/accounted-copy/${tip}/`;
  const known = new Set(report.notices.map(notice => JSON.stringify(notice)));
  appendCleanupReport(report, { refs: [], notices: [{
    condition: `The interrupted copy's outcome at ${destination.fetchUrl} could not be established; its proposed actions are not reported as landed.`,
    remedy: { text: `Inspect the original attempt with git show ${retained}record and compare its expected and proposed tips with ${destination.fetchUrl}. Proposed objects remain under ${retained}tips/. Repair any remaining state by hand.` },
  }, ...held.record.attempt?.report.notices.filter(notice => !known.has(JSON.stringify(notice))).map(notice => ({ ...notice,
    condition: `If the interrupted copy landed at ${destination.fetchUrl}: ${notice.condition}` })) ?? []] });
}
