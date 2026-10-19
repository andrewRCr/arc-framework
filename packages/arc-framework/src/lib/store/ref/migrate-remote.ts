/** Resolve explicit remote move targets and preserve their recorded transport coordinates. */
import type { Store } from "../contract.js";
import type { MigrateReport, StoreMigrateResult } from "../commands.js";
import type { RefBackendContext } from "./context.js";
import { readRefDesignation } from "./designation.js";
import { captureMoveRemote } from "./migrate-remote-target.js";
import { migrationCodeContext, readMoveRecord, type MoveRemote, type RecordedRemote, type RemoteMoveRecord } from "./migrate-record.js";
import { readRefRepository } from "./repository.js";
import { readSyncRefs } from "./sync-graph.js";
import { fetchLayoutObjects } from "./migrate-layout-build.js";
import { copyRemoteMove, clearRemoteGathering, remoteCopyReport, readRemoteCopyReport, type RemoteCopy } from "./migrate-remote-copy.js";
import { deleteRemoteSource } from "./migrate-remote-delete.js";
import { forwardRemoteMove } from "./migrate-remote-forward.js";
import { switchRemoteMove, remoteSwitchComplete } from "./migrate-remote-switch.js";
import { MigrationRefusal } from "./migrate-refusal.js";
import { describeEndedRemoteMove, endRemoteMove } from "./migrate-remote-end.js";
import { FORWARDING_REF } from "./forwarding-record.js";

/** Copy under the caller's move lock and retain the exact record until forwarding and switching finish. */
export async function moveRefRemote(context: RefBackendContext, store: Store, to?: string, trial = false, resume?: RecordedRemote): Promise<StoreMigrateResult> {
  const code = await migrationCodeContext(context);
  try { return await performRemoteMove(context, code, store, to, trial, resume); }
  catch (error) {
    if (!(error instanceof MigrationRefusal)) throw error;
    const recorded = await readMoveRecord(code);
    if (recorded.status === "ok" && recorded.result === null) await clearRemoteGathering(code);
    return { status: "refused", refusal: error.refusal };
  }
}

async function performRemoteMove(context: RefBackendContext, code: RefBackendContext, store: Store,
  to: string | undefined, trial: boolean, resume?: RecordedRemote): Promise<StoreMigrateResult> {
  const transports = resume?.record ?? await resolveMoveRemotes(context, code, to);
  if (to && resume && ![transports.destination.name, transports.destination.fetchUrl].includes(to)) return unfinishedMove(transports.destination.name);
  const physical = await readRefRepository(context);
  const local = await readSyncRefs(physical, "refs/arc/project/registry");
  await fetchLayoutObjects(code, physical.repository?.gitDir ?? physical.repository?.commonDir ?? "", local);
  const active = resume;
  if (!trial && active && await remoteSwitchComplete(context, active)) return finishRemoteMove(code, active, await readRemoteCopyReport(code));
  return runRemoteMoveRounds(context, code, store, transports, local, trial, active);
}

async function runRemoteMoveRounds(context: RefBackendContext, code: RefBackendContext, store: Store,
  transports: Pick<RemoteMoveRecord, "source" | "destination">, local: ReadonlyMap<string, string>, trial: boolean, active?: RecordedRemote): Promise<StoreMigrateResult> {
  for (;;) {
    const copied = await copyRemoteMove(code, transports.source, transports.destination, local, trial, active);
    if (trial) return remoteMoveTrial(context, code, copied, active !== undefined);
    if (copied.ended) {
      if (!copied.recorded) throw new Error("An ended remote move has no record");
      const ended = await endRemoteMove(code, copied.recorded, copied);
      if (ended) return { status: "ok", result: ended };
      active = copied.recorded;
      continue;
    }
    if (!copied.recorded) throw new Error("A copied remote move has no record");
    active = copied.recorded;
    if (await forwardRemoteMove(code, copied) === "restart") continue;
    await switchRemoteMove(context, store, active);
    return finishRemoteMove(code, active, copied.report);
  }
}

async function remoteMoveTrial(context: RefBackendContext, code: RefBackendContext, copy: RemoteCopy, recorded: boolean): Promise<StoreMigrateResult> {
  if (!recorded) await clearRemoteGathering(code);
  if (copy.ended && copy.recorded) return { status: "ok", result: describeEndedRemoteMove(copy.recorded, copy, await remoteSwitchComplete(context, copy.recorded)) };
  return { status: "ok", result: trialRemoteReport(copy) };
}

async function resolveMoveRemotes(context: RefBackendContext, code: RefBackendContext, to?: string): Promise<{ source: MoveRemote; destination: MoveRemote }> {
  const designation = await readRefDesignation(context), source = designation.pushes[0];
  if (!source || designation.pushes.length !== 1) throw new MigrationRefusal({ code: "no-state-remote", class: "recoverable",
    condition: "This clone has no single state remote to move from.", remedy: { text: "Designate a code repository remote with arc store remote <remote> push, or change the backing pointer and run arc store remote backing push, then retry --to." } });
  if (!to) throw new Error("An unrecorded remote move requires a destination");
  const candidate = designation.codeRemotes.find(remote => remote.name === to);
  const destination: MoveRemote = candidate ? await captureMoveRemote(context, code, candidate) : { name: "backing", fetchUrl: to, pushUrl: to, repository: "backing" };
  const captured = await captureMoveRemote(context, code, source);
  if (captured.fetchUrl === destination.fetchUrl && captured.pushUrl === destination.pushUrl) throw new MigrationRefusal({ code: "request-invalid", class: "terminal",
    condition: "The source and destination resolve to the same state remote.", remedy: { text: "Choose a different remote or run arc store migrate with no target to reconcile this clone's layout." } });
  return { source: captured, destination };
}

function unfinishedMove(destination: string): Extract<StoreMigrateResult, { status: "refused" }> {
  return { status: "refused", refusal: { code: "move-unfinished", class: "recoverable", condition: `A remote move to ${destination} is recorded; finish it before choosing another destination.`,
    remedy: { text: "Run arc store migrate to finish the recorded move.", argv: ["arc", "store", "migrate"] } } };
}

function pointerFollowNotice(): { condition: string } {
  return { condition: "Teammates follow this move once the tracked pointer's change reaches them as code. "
    + "Later publication stops at the old remote; already published state is not unpublished. "
    + "A push composed before the switch, including one already in flight in another worktree, may land after "
    + "the move's last listing and stay on the old remote until a follow answering push clears it." };
}

function trialRemoteReport(copy: RemoteCopy): MigrateReport {
  const source = new Map([...copy.source].filter(([ref]) => ref !== FORWARDING_REF));
  const deletes = remoteCopyReport(source, new Map(), []).refs.map(row => ({ ...row, action: "delete" as const }));
  return { ...copy.report, refs: [...copy.report.refs, ...deletes], notices: [...copy.report.notices, pointerFollowNotice()] };
}

async function finishRemoteMove(code: RefBackendContext, recorded: RecordedRemote, copied: import("../commands.js").MigrateReport): Promise<StoreMigrateResult> {
  const deleted = await deleteRemoteSource(code, recorded);
  return { status: "ok", result: { ...copied, refs: [...copied.refs, ...deleted.refs], notices: [...copied.notices, ...deleted.notices, pointerFollowNotice()] } };
}
