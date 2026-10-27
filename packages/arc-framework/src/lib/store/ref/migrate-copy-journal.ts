/** Retain copy reports across the gap between external publication and local settlement. */

import { z } from "zod";
import { canonicalize } from "../../kernel/canonical/canonical-json.js";
import { MigrateReportSchema, type MigrateReport } from "../commands.js";
import { CommitShaSchema } from "../links.js";
import type { PushRefChange } from "../../git/push.js";
import type { RefBackendContext } from "./context.js";
import { readBatchObjects } from "./batch-read.js";
import { readSyncRefs, syncRefIsAncestor } from "./sync-graph.js";
import { writeRefBlob } from "./tree-write.js";
import { requireLayoutTransaction } from "./migrate-layout-build.js";
import { readMoveRecord, type MoveRemote } from "./migrate-record.js";
import { MigrationRefusal } from "./migrate-refusal.js";
import { appendCleanupReport } from "./migrate-report.js";
import { retainCleanupReport, readRemoteCopyReport } from "./migrate-cleanup-report.js";

const root = "refs/arc/tmp/migrate/pending-copy/", recordRef = root + "record";
const ChangeSchema = z.strictObject({ ref: z.string().startsWith("refs/arc/"), next: CommitShaSchema.nullable(), expected: CommitShaSchema.nullable() });
const JournalSchema = z.strictObject({ schemaVersion: z.literal(1), key: z.string().min(1), settled: MigrateReportSchema,
  attempt: z.strictObject({ changes: z.array(ChangeSchema), report: MigrateReportSchema }).nullable() });
type Journal = z.infer<typeof JournalSchema>;

/** The exact active copy account and refs retaining its proposed objects. */
export interface CopyJournal { refs: Map<string, string>; record: Journal }

/** Bind pending reports to the original operation and observed repositories while allowing push transport repair. */
export function copyJournalKey(kind: "remote" | "follow" | "leave-source", source: MoveRemote, destination: MoveRemote, generation?: string): string {
  const observed = ({ name, repository, url, fetchUrl }: MoveRemote) => ({ name, repository, url, fetchUrl });
  return canonicalize({ kind, source: observed(source), destination: observed(destination), ...generation ? { generation } : {} });
}

/** Read pending copy evidence independently of whether its publication license still stands. */
export async function readCopyJournal(context: RefBackendContext): Promise<CopyJournal | undefined> {
  const refs = await readSyncRefs(context, root), tip = refs.get(recordRef);
  if (!tip) return;
  const object = (await readBatchObjects(context, [tip])).get(tip);
  if (object?.type !== "blob") throw new Error("The pending migration copy report is unavailable");
  return { refs, record: JournalSchema.parse(JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(object.bytes))) };
}


/** Transfer the account before retiring its active refs, retaining uncertain proposals for manual inspection. */
export async function transferCopyJournal(context: RefBackendContext, held: CopyJournal, report: MigrateReport, nextKey?: string): Promise<void> {
  const changes = [...held.refs].map(([ref, expected]) => ({ ref, expected, delete: true as const }));
  const retained: { ref: string; expected: string | null; next: string }[] = [];
  if (held.record.attempt) {
    const tip = held.refs.get(recordRef);
    if (!tip) throw new Error("The retained copy account has no record tip");
    const archive = `refs/arc/tmp/migrate/accounted-copy/${tip}/`;
    const prior = await readSyncRefs(context, archive);
    for (const [ref, next] of held.refs) retained.push({ ref: archive + ref.slice(root.length), expected: prior.get(archive + ref.slice(root.length)) ?? null, next });
  }
  if (nextKey) {
    const next = await writeRefBlob(context, JSON.stringify(JournalSchema.parse({ schemaVersion: 1, key: nextKey, settled: report, attempt: null })));
    await retainCleanupReport(context, report, [...changes.filter(change => change.ref !== recordRef), ...retained,
      { ref: recordRef, expected: held.refs.get(recordRef) ?? null, next }]);
  } else await retainCleanupReport(context, report, [...changes, ...retained]);
}

function requireKey(record: Journal, key: string): void {
  if (record.key === key) return;
  throw new MigrationRefusal({ code: "move-unfinished", class: "recoverable",
    condition: "An interrupted copy retains a report for another migration direction or follow answer.",
    remedy: { text: "Retry the original migration target and publication answer to settle its copy before choosing another." } });
}

/** Keep an already accounted report until its freshly accepted continuation records a durable owner. */
export async function retainCopyAccount(context: RefBackendContext, key: string, report: MigrateReport): Promise<void> {
  await saveJournal(context, JournalSchema.parse({ schemaVersion: 1, key, settled: report, attempt: null }), new Map());
}

async function saveJournal(context: RefBackendContext, record: Journal, prior: ReadonlyMap<string, string>): Promise<void> {
  const next = new Map([[recordRef, await writeRefBlob(context, JSON.stringify(JournalSchema.parse(record)))]]);
  // These tips keep the proposed merge objects available even if a fresh entry clears its gathering refs.
  for (const change of record.attempt?.changes ?? []) if (change.next) next.set(root + "tips/" + change.ref.slice("refs/arc/".length), change.next);
  await requireLayoutTransaction(context, [...[...next].map(([ref, next]) => ({ ref, next, expected: prior.get(ref) ?? null })),
    ...[...prior].filter(([ref]) => !next.has(ref)).map(([ref, expected]) => ({ ref, expected, delete: true as const }))]);
}

/** Persist the proposed report before any publication, keeping prior landed effects separate. */
export async function beginCopyJournal(context: RefBackendContext, key: string, changes: readonly PushRefChange[], report: MigrateReport): Promise<void> {
  const prior = await readCopyJournal(context);
  if (prior) {
    requireKey(prior.record, key);
    if (prior.record.attempt) throw new MigrationRefusal({ code: "move-unfinished", class: "recoverable",
      condition: "The interrupted copy still needs its destination result established.",
      remedy: { text: "Retry the same migration to reconcile its retained copy before starting another attempt." } });
  }
  const settled = prior?.record.settled ?? await readRemoteCopyReport(context);
  const record: Journal = { schemaVersion: 1, key, settled,
    attempt: { changes: changes.map(change => ({ ref: change.ref, next: change.next, expected: change.expected ?? null })), report } };
  await saveJournal(context, record, prior?.refs ?? new Map());
}

async function landedChange(context: RefBackendContext, change: z.infer<typeof ChangeSchema>, destination: ReadonlyMap<string, string>,
  proposed: ReadonlyMap<string, string | null>): Promise<boolean> {
  if (change.next === null && !destination.has(change.ref)) return true;
  const paired = /^refs\/arc\/history\/(work|cohort)\//u.test(change.ref)
    ? change.ref.replace(/^refs\/arc\/history\/(work|cohort)\//u, "refs/arc/$1/")
    : change.ref.replace(/^refs\/arc\/(work|cohort)\//u, "refs/arc/history/$1/");
  // A later lifecycle move may recreate the deleted coordinate from the paired update in this same attempt.
  const next = change.next ?? (paired !== change.ref ? proposed.get(paired) : undefined);
  const current = destination.get(change.ref) ?? (change.next !== null && paired !== change.ref ? destination.get(paired) : undefined);
  if (!next || !current) return false;
  if (current === next) return true;
  const objects = await readBatchObjects(context, [next, current]);
  return objects.get(next)?.type === "commit" && objects.get(current)?.type === "commit"
    && await syncRefIsAncestor(context, next, current);
}

/** Reconcile an interrupted atomic copy against freshly fetched destination evidence before rebuilding it. */
export async function recoverCopyJournal(context: RefBackendContext, key: string, destination: ReadonlyMap<string, string>): Promise<MigrateReport | undefined> {
  const held = await readCopyJournal(context);
  if (!held) return;
  requireKey(held.record, key);
  const { record, refs } = held, attempt = record.attempt;
  if (attempt) {
    let landed = true;
    const proposed = new Map(attempt.changes.map(({ ref, next }) => [ref, next]));
    for (const change of attempt.changes) if (!await landedChange(context, change, destination, proposed)) { landed = false; break; }
    const unchanged = attempt.changes.every(change => (destination.get(change.ref) ?? null) === change.expected);
    if (!landed && !unchanged) throw new MigrationRefusal({ code: "move-unfinished", class: "recoverable",
      condition: "Destination state changed after an interrupted copy, so its landed report cannot yet be established.",
      remedy: { text: "Restore the interrupted copy's retained target tips at the destination, then retry the same migration; its pending evidence remains local." } });
    if (landed) appendCleanupReport(record.settled, attempt.report);
    record.attempt = null;
    await saveJournal(context, record, refs);
  }
  await retainCleanupReport(context, record.settled);
  return record.settled;
}

/** Whether a prior copy needs complete destination evidence before its lifecycle continuation. */
export async function hasCopyJournal(context: RefBackendContext): Promise<boolean> {
  return (await readSyncRefs(context, root)).has(recordRef);
}

/** Restore earlier landed effects to a cleanup report before testing its current lifecycle license. */
export async function recoverCopyReport(context: RefBackendContext, key: string, destination: ReadonlyMap<string, string>, report: MigrateReport): Promise<void> {
  const carried = await recoverCopyJournal(context, key, destination);
  if (carried) { appendCleanupReport(report, carried); await releaseCopyJournal(context); }
}

/** Record confirmed publication before the enclosing move updates its report and comparison bases. */
export async function confirmCopyJournal(context: RefBackendContext): Promise<MigrateReport> {
  const held = await readCopyJournal(context);
  if (!held) throw new Error("A confirmed migration copy has no pending report");
  if (held.record.attempt) appendCleanupReport(held.record.settled, held.record.attempt.report);
  held.record.attempt = null;
  await saveJournal(context, held.record, held.refs);
  return held.record.settled;
}

/** Drop only the unlanded attempt after a definitive refusal or lost lease, preserving earlier settled reports. */
export async function abandonCopyAttempt(context: RefBackendContext): Promise<void> {
  const held = await readCopyJournal(context);
  if (!held) return;
  held.record.attempt = null;
  await saveJournal(context, held.record, held.refs);
  if (!held.record.settled.refs.length && !held.record.settled.notices.length) await clearCopyJournal(context);
  else {
    await retainCleanupReport(context, held.record.settled);
    await releaseCopyJournal(context);
  }
}

async function clearCopyJournal(context: RefBackendContext): Promise<void> {
  const refs = await readSyncRefs(context, root);
  if (refs.size) await requireLayoutTransaction(context, [...refs].map(([ref, expected]) => ({ ref, expected, delete: true as const })));
}

/** A recorded move now owns the settled report; unrecorded follow/departure entries keep it until their record lands. */
export async function releaseCopyJournal(context: RefBackendContext): Promise<void> {
  const move = await readMoveRecord(context);
  if (move.status === "ok" && move.result !== null) await clearCopyJournal(context);
}

/** A nonpublishing follow cannot replace a pending publishing answer. */
export async function requireNoPendingCopy(context: RefBackendContext): Promise<void> {
  if (await readCopyJournal(context)) throw new MigrationRefusal({ code: "move-unfinished", class: "recoverable",
    condition: "An interrupted publishing copy retains its original report.",
    remedy: { text: "Retry the original push answer to settle that copy before changing the follow answer." } });
}
