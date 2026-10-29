/** Hand a superseded unrecorded follow's historical report to its freshly judged successor. */
import type { MigrateReport } from "../commands.js";
import type { RefBackendContext } from "./context.js";
import type { FollowMoveRecord, MoveRemote } from "./migrate-record.js";
import { copyJournalKey, readCopyJournal, requireNoPendingCopy, retainCopyAccount } from "./migrate-copy-journal.js";
import { accountCopyJournal, copyAccountIdentity } from "./migrate-copy-account.js";
import { readRemoteCopyReport } from "./migrate-cleanup-report.js";

function sameSource(left: Omit<MoveRemote, "pushUrl">, right: Omit<MoveRemote, "pushUrl">): boolean {
  return left.name === right.name && left.repository === right.repository && left.url === right.url && left.fetchUrl === right.fetchUrl;
}

/** Only a freshly accepted follow from the same observed source may take over its historical account. */
export async function handoffFollowCopy(context: RefBackendContext, record: FollowMoveRecord): Promise<MigrateReport | undefined> {
  const held = await readCopyJournal(context);
  const nextKey = copyJournalKey("follow", record.source, record.destination, record.forwardingTip);
  if (!held) {
    const report = await readRemoteCopyReport(context);
    if (!report.refs.length && !report.notices.length) return;
    await retainCopyAccount(context, nextKey, report);
    return report;
  }
  if (held.record.key === nextKey && record.answer === "push") return;
  const prior = copyAccountIdentity(held);
  if (prior.kind !== "follow" || !sameSource(prior.source, record.source)) { await requireNoPendingCopy(context); return; }
  const report = await readRemoteCopyReport(context);
  // A nonpublishing answer keeps the original key until its move record durably owns the account.
  await accountCopyJournal(context, report, record.answer === "push" ? nextKey : held.record.key);
  return report;
}

/** A successful source read can retire its withdrawn follow's account without licensing a new publication. */
export async function accountWithdrawnFollow(context: RefBackendContext, source: Omit<MoveRemote, "pushUrl">): Promise<MigrateReport | undefined> {
  const held = await readCopyJournal(context);
  if (held) {
    const prior = copyAccountIdentity(held);
    if (prior.kind !== "follow" || !sameSource(prior.source, source)) { await requireNoPendingCopy(context); return; }
    await accountCopyJournal(context, await readRemoteCopyReport(context));
  }
  const report = await readRemoteCopyReport(context);
  return report.refs.length || report.notices.length ? report : undefined;
}

/** Disabling this source ends only its own follow account; unrelated pending operations remain guarded. */
export async function accountDisabledFollow(context: RefBackendContext, source: Omit<MoveRemote, "pushUrl">): Promise<MigrateReport | undefined> {
  const held = await readCopyJournal(context);
  if (held) {
    const prior = copyAccountIdentity(held);
    if (prior.kind !== "follow" || !sameSource(prior.source, source)) return;
  }
  return accountWithdrawnFollow(context, source);
}
