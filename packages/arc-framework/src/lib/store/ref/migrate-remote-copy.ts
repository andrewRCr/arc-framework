/** Prepare and atomically land one remote copy while retaining restart and deletion bases. */
import { MigrateReportSchema, type MigrateReport } from "../commands.js";
import type { Remedy } from "../refusal.js";
import { RecordReferenceSchema } from "../identity.js";
import { pushRefs, type PushOutcome, type PushRefChange } from "../../git/push.js";
import { classifyPushOutcome } from "../../git/push-classification.js";
import type { RefBackendContext } from "./context.js";
import { readRefRepository } from "./repository.js";
import { commitMigrationRegistry, requireMoveProject } from "./migrate-registry.js";
import { prepareRefCopy } from "./migrate-copy.js";
import { requireLayoutTransaction } from "./migrate-layout-build.js";
import { clearMigrationRefs, fetchMigrationRemote } from "./migrate-remote-fetch.js";
import { MigrationRefusal } from "./migrate-refusal.js";
import { readForwardingRecord, FORWARDING_REF } from "./forwarding-record.js";
import { readBatchObjects } from "./batch-read.js";
import { writeRefBlob } from "./tree-write.js";
import { projectIdentityQueries, projectOwnerFromObjects } from "./project-identity.js";
import { readSyncRefs, syncRefIsAncestor } from "./sync-graph.js";
import { listRemoteRefs } from "./remote-listing.js";
import { saveMoveRecord, removeMoveRecord, readMoveRecord, type MoveRemote, type MoveTransports, type RecordedRemote, type RemoteMoveRecord } from "./migrate-record.js";

const registryRef = "refs/arc/project/registry";
const copyRoot = "refs/arc/tmp/migrate/remote/copy/";
const copiedRoot = "refs/arc/tmp/migrate/copied/";
const deletedRecordRef = "refs/arc/tmp/migrate/deleted-record";
/** One completed copy and the source basis retained for forwarding and deletion. */
export interface RemoteCopy { recorded?: RecordedRemote; ended?: "source-forwarded" | "destination-forwarded" | "moved-back"; report: MigrateReport; source: Map<string, string>; destination: Map<string, string> }

/** The caller holds only the move lock; all merge commits target temporary refs in the code repository. */
export async function copyRemoteMove(code: RefBackendContext, transports: MoveTransports,
  local: ReadonlyMap<string, string>, trial: boolean, resume?: RecordedRemote): Promise<RemoteCopy> {
  const { source, destination } = transports;
  let recorded = resume;
  const firstRun = resume === undefined;
  for (;;) {
    const basis = await readRemoteCopyBasis(code, source, destination, local, recorded);
    const { incoming, held, observed } = basis;
    if (basis.ended) return { recorded, ended: basis.ended, report: await readRemoteCopyReport(code), source: incoming, destination: held };
    if (basis.ownForwarding && recorded) {
      return { recorded, report: await readRemoteCopyReport(code), source: incoming, destination: held };
    }
    await requireMoveProject(code, incoming.get(registryRef), source.name);
    await retainKnownCopyVersion(code, recorded, held);
    await code.migrateStep?.("remote.build");
    const prepared = await buildRemoteCopy(code, incoming, held);
    const report = remoteCopyReport(prepared.refs, held, prepared.notices);
    if (trial) { await clearMigrationRefs(code, copyRoot); return { report, source: incoming, destination: held }; }
    recorded = await saveRemoteCopyRecord(code, { kind: "remote", source, destination, registryCommit: prepared.registry,
      sourceLayout: transports.sourceLayout, destinationLayout: transports.destinationLayout }, recorded);
    await retainDeletedRecord(code, held.get(FORWARDING_REF));
    await code.migrateStep?.("remote.copy");
    const changes = remoteCopyChanges(prepared.refs, held);
    const pushed = await atomicMigrationPush(code, destination.pushUrl, changes);
    const settled = await settleMigrationPush(code, destination.pushUrl, changes, pushed);
    if (settled === "restart") continue;
    if (settled === "refused") await refuseCopyPush(code, recorded, pushed, firstRun);
    await retainCopiedTips(code, incoming, observed, { registry: prepared.registry, report, destination: held });
    await code.migrateStep?.("remote.copied");
    return { recorded, report, source: incoming, destination: held };
  }
}

async function refuseCopyPush(code: RefBackendContext, recorded: RecordedRemote, pushed: PushOutcome, firstRun: boolean): Promise<never> {
  const removed = firstRun && pushed.status !== "unreachable";
  if (removed) { await removeMoveRecord(code, recorded); await clearRemoteGathering(code, true); }
  const destination = recorded.record.destination, target = destination.repository === "backing" ? destination.url : destination.name;
  const retry = removed ? { text: `Enable atomic pushes and repair the receiver's hook or permissions, then retry arc store migrate --to ${target}.`,
    argv: ["arc", "store", "migrate", "--to", target] } : undefined;
  throw new MigrationRefusal(migrationPushRefusal(pushed, retry));
}

async function readRemoteCopyBasis(code: RefBackendContext, source: MoveRemote, destination: MoveRemote,
  local: ReadonlyMap<string, string>, recorded?: RecordedRemote) {
  const observed = await captureMoveHeads(code, source);
  await code.migrateStep?.("remote.fetch-source");
  const incoming = await fetchMigrationRemote(code, source, true);
  const forwarding = await checkSourceForwarding(code, incoming, source, recorded);
  if (forwarding === "ended") return { incoming, observed, held: await fetchMigrationRemote(code, destination, true), ended: "source-forwarded" as const };
  await code.migrateStep?.("remote.fetch-destination");
  const controls = await fetchMigrationRemote(code, destination, false);
  const controlEnd = await destinationEndReason(code, local, controls, incoming, destination, recorded);
  if (controlEnd) return { incoming, observed, held: await fetchMigrationRemote(code, destination, true), ended: controlEnd };
  if (forwarding === "own") return { incoming, observed, held: controls, ownForwarding: true };
  const held = await fetchMigrationRemote(code, destination, true);
  // Classify the complete snapshot as well: another move may land between these acquisitions.
  const ended = await destinationEndReason(code, local, held, incoming, destination, recorded);
  return { incoming, observed, held, ended };
}

async function destinationEndReason(code: RefBackendContext, local: ReadonlyMap<string, string>, held: ReadonlyMap<string, string>,
  incoming: ReadonlyMap<string, string>, destination: MoveRemote, recorded?: RecordedRemote): Promise<RemoteCopy["ended"]> {
  if (await checkCopyProject(code, local, held, incoming, destination, recorded)) return "destination-forwarded";
  if (recorded && await meetsMoveBack(code, incoming, held, recorded)) return "moved-back";
  return undefined;
}

async function meetsMoveBack(code: RefBackendContext, incoming: ReadonlyMap<string, string>, destination: ReadonlyMap<string, string>, recorded: RecordedRemote): Promise<boolean> {
  const registry = incoming.get(registryRef);
  const forwarding = await readForwardingRecord(code, destination.get(FORWARDING_REF), recorded.record.destination.name);
  if (forwarding.status === "refused") throw new MigrationRefusal(forwarding.refusal);
  return forwarding.result !== null && registry !== undefined && await registryHoldsMove(code, recorded.record.registryCommit, registry);
}

async function checkSourceForwarding(code: RefBackendContext, incoming: ReadonlyMap<string, string>, source: MoveRemote, recorded?: RecordedRemote): Promise<"own" | "none" | "ended"> {
  const forwarding = await readForwardingRecord(code, incoming.get(FORWARDING_REF), source.name);
  if (forwarding.status === "refused") throw new MigrationRefusal(forwarding.refusal);
  if (forwarding.result && recorded?.record.registryCommit === forwarding.result.registryCommit) return "own";
  if (forwarding.result && recorded) return "ended";
  if (forwarding.result) throw new MigrationRefusal({ code: "moved", class: "recoverable", condition: `State moved from ${source.name}.`,
    remedy: { text: "Bring in the tracked pointer change and run arc store migrate to follow, then use --to from the remote it follows to.", argv: ["arc", "store", "migrate"] } });
  return "none";
}

/** Refuse cross-project copies and identify a recorded destination that has moved beyond its source. */
export async function checkCopyProject(code: RefBackendContext, local: ReadonlyMap<string, string>, destination: ReadonlyMap<string, string>,
  source: ReadonlyMap<string, string>, remote: MoveRemote, recorded?: RecordedRemote): Promise<boolean> {
  const forwarding = await readForwardingRecord(code, destination.get(FORWARDING_REF), remote.name);
  if (forwarding.status === "refused") throw new MigrationRefusal(forwarding.refusal);
  const [stored, origin, other] = await Promise.all([local, source, destination].map(refs => copyProjectId(code, refs)));
  const localId = stored ?? origin;
  const ids = [origin, other, forwarding.result?.projectId];
  const foreign = ids.find(id => id && localId && id !== localId);
  if (foreign) throw new MigrationRefusal({ code: "store", refusal: { code: "identity-mismatch", class: "recoverable",
    expected: RecordReferenceSchema.parse({ kind: "project-registry/identity", owner: { type: "project", name: "project", uid: localId } }), actual: RecordReferenceSchema.parse({ kind: "project-registry/identity", owner: { type: "project", name: "project", uid: foreign } }),
    condition: `${origin && stored && origin !== stored ? "The migration source" : `Remote ${remote.name}`} belongs to project ${foreign}; this store belongs to ${localId}.`, remedy: { text: "Choose a destination for this project, then retry --to." } } });
  const registry = source.get(registryRef);
  if (forwarding.result && (!registry || !await registryHoldsMove(code, forwarding.result.registryCommit, registry))) {
    if (recorded) return true;
    throw new MigrationRefusal({ code: "moved", class: "recoverable", condition: `${FORWARDING_REF} on ${remote.name} belongs to a different line of moves.`,
      remedy: { text: "Use arc store migrate --to <remote> naming the remote the state moved to: one without a forwarding record whose registry holds this record's commit." } });
  }
  return false;
}

async function buildRemoteCopy(code: RefBackendContext, incoming: ReadonlyMap<string, string>, destination: ReadonlyMap<string, string>) {
  const copied = await prepareRemoteReCopy(code, incoming, destination);
  const registry = copied.refs.get(registryRef);
  if (!registry) throw new Error("A remote migration requires a project registry");
  const next = await commitMigrationRegistry(code, registry, "move-remote");
  copied.refs.set(registryRef, next);
  await requireLayoutTransaction(code, [{ ref: copyRoot + "project/registry", next, expected: registry }]);
  return { ...copied, registry: next };
}

/** Reconcile the complete source over an isolated destination without minting another move version. */
export async function prepareRemoteReCopy(code: RefBackendContext, incoming: ReadonlyMap<string, string>, destination: ReadonlyMap<string, string>): Promise<import("./migrate-copy.js").PreparedRefCopy> {
  await clearMigrationRefs(code, copyRoot);
  const ordinary = (refs: ReadonlyMap<string, string>): Map<string, string> => new Map([...refs].filter(([ref]) => ref !== FORWARDING_REF));
  await requireLayoutTransaction(code, [...ordinary(destination)].map(([ref, next]) => ({ ref: copyRoot + ref.slice("refs/arc/".length), next, expected: null })));
  return prepareRefCopy(code, ordinary(incoming), "unlocked", copyRoot);
}

/** Lease the complete prepared state, including lifecycle removals and replaced forwarding controls. */
export function remoteCopyChanges(planned: ReadonlyMap<string, string>, destination: ReadonlyMap<string, string>): PushRefChange[] {
  return [...[...planned].map(([ref, next]) => ({ ref, next, expected: destination.get(ref) ?? null })),
    ...[...destination].filter(([ref]) => !planned.has(ref)).map(([ref, expected]) => ({ ref, next: null, expected }))];
}

/** Require an atomic receiver even for a registry-only move. */
export async function atomicMigrationPush(code: RefBackendContext, url: string, changes: PushRefChange[]): Promise<PushOutcome> {
  return pushRefs(async (command, args, options) => code.exec(command, args.includes("--atomic") ? args : [args[0] ?? "push", "--atomic", ...args.slice(1)], options), url, changes, { cwd: code.checkoutRoot });
}

/** A lost lease, or a receiver refusal whose leased refs have moved since, reruns the round rather than weakening its leases. */
async function settleMigrationPush(code: RefBackendContext, url: string, changes: readonly PushRefChange[],
  outcome: PushOutcome, remedy?: Remedy): Promise<"landed" | "restart" | "refused"> {
  const classified = classifyPushOutcome(outcome);
  if (classified.status === "ok") return "landed";
  if (classified.status === "lost-race") return "restart";
  return classified.status === "by-state" && await leasesMoved(code, url, changes, remedy) ? "restart" : "refused";
}

/** True once the push landed and false to rerun its round; any other outcome refuses with the receiver's cause. */
export async function migrationPushLanded(code: RefBackendContext, url: string, changes: readonly PushRefChange[], outcome: PushOutcome, remedy?: Remedy): Promise<boolean> {
  const settled = await settleMigrationPush(code, url, changes, outcome, remedy);
  if (settled === "refused") throw new MigrationRefusal(migrationPushRefusal(outcome, remedy));
  return settled === "landed";
}

async function leasesMoved(code: RefBackendContext, url: string, changes: readonly PushRefChange[], remedy?: Remedy): Promise<boolean> {
  const listed = await listRemoteRefs(code, url, ["refs/arc/*"]);
  if (listed.status === "unreachable") throw new MigrationRefusal({ code: "store", refusal: { code: "unreachable", class: "recoverable", cause: listed.cause,
    condition: `Could not read ${url} after it refused the move's push: ${listed.condition}`,
    remedy: remedy ?? { text: "Restore access and run arc store migrate; the refused push changed nothing there.", argv: ["arc", "store", "migrate"] } } });
  return changes.some(({ ref, expected }) => (listed.tips.get(ref) ?? null) !== (expected ?? null));
}

/** Preserve transport and definitive receiver refusals with the caller's restart route. */
export function migrationPushRefusal(outcome: PushOutcome, remedy?: Remedy): Extract<import("../commands.js").StoreCommandRefusal, { code: "store" }> {
  const condition = outcome.stderr || outcome.stdout || "The destination refused the atomic state copy.";
  return { code: "store", refusal: outcome.status === "unreachable" ? { code: "unreachable", class: "recoverable", cause: outcome.cause, condition,
    remedy: remedy ?? { text: "Restore access and run arc store migrate; the recorded copy may have landed.", argv: ["arc", "store", "migrate"] } } : { code: "refused", class: "terminal", message: condition, condition,
    remedy: remedy ?? { text: "Enable atomic pushes and repair the receiver's hook or permissions, then retry arc store migrate.", argv: ["arc", "store", "migrate"] } } };
}

/** Pin a landed copy and comparison heads for an enclosing move or follow. */
export async function retainCopiedTips(code: RefBackendContext, source: ReadonlyMap<string, string>, observed: ReadonlyMap<string, string>,
  copied: { registry?: string; report: MigrateReport; destination: ReadonlyMap<string, string>; headBasis?: ReadonlyMap<string, string> }): Promise<void> {
  const prior = await readSyncRefs(code, copiedRoot);
  const retained = new Map([...source].filter(([ref]) => ref !== FORWARDING_REF).map(([ref, tip]) => [copiedRoot + "state/" + ref.slice("refs/arc/".length), tip]));
  if (copied.registry) retained.set(copiedRoot + "registry", copied.registry);
  retained.set(copiedRoot + "report", await writeRefBlob(code, JSON.stringify(MigrateReportSchema.parse(copied.report))));
  for (const [name, tip] of observed) {
    const suffix = name.slice(name.indexOf("/") + 1), live = "refs/arc/" + suffix;
    const paired = live.includes("/history/") ? live.replace("/history/", "/") : live.replace(/^refs\/arc\/(work|cohort)\//u, "refs/arc/history/$1/");
    const headBasis = copied.headBasis ?? source;
    const candidates = [...new Set([headBasis.get(live), headBasis.get(paired)])].filter((value): value is string => value !== undefined);
    for (const current of candidates) if (await syncRefIsAncestor(code, tip, current)) { retained.set(copiedRoot + name, tip); break; }
  }
  const kept = copied.destination.get(FORWARDING_REF) ?? prior.get(copiedRoot + "deleted-record") ?? (await readSyncRefs(code, deletedRecordRef)).get(deletedRecordRef);
  if (kept) retained.set(copiedRoot + "deleted-record", kept);
  await requireLayoutTransaction(code, [...[...retained].map(([ref, next]) => ({ ref, next, expected: prior.get(ref) ?? null })),
    ...[...prior].filter(([ref]) => !retained.has(ref)).map(([ref, expected]) => ({ ref, expected, delete: true as const }))]);
  await retainDeletedRecord(code, kept);
}

async function retainKnownCopyVersion(code: RefBackendContext, recorded: RecordedRemote | undefined, held: ReadonlyMap<string, string>): Promise<void> {
  const registry = held.get(registryRef);
  if (!recorded || !registry || !await registryHoldsMove(code, recorded.record.registryCommit, registry)) return;
  const ref = copiedRoot + "registry", expected = (await readSyncRefs(code, ref)).get(ref) ?? null;
  await requireLayoutTransaction(code, [{ ref, next: recorded.record.registryCommit, expected }]);
}

/** Use the last landed copy for forwarding leases even after a later copy attempt replaced the journal. */
export async function readRemoteCopyVersion(code: RefBackendContext, fallback: string): Promise<string> {
  const ref = copiedRoot + "registry";
  return (await readSyncRefs(code, ref)).get(ref) ?? fallback;
}

/** Drop a move's remote gathering and copied state, and its deleted forwarding record only after a definitive first-copy refusal. */
export async function clearRemoteGathering(code: RefBackendContext, includeDeletedRecord = false): Promise<void> {
  await clearMigrationRefs(code, "refs/arc/tmp/migrate/remote/");
  await clearMigrationRefs(code, copiedRoot);
  if (includeDeletedRecord) await clearMigrationRefs(code, deletedRecordRef);
}

/** Clean a failed attempt only after proving no record stands; cleanup never replaces its original failure. */
export async function clearUnrecordedGathering(code: RefBackendContext): Promise<void> {
  try {
    const held = await readMoveRecord(code);
    if (held.status === "ok" && held.result === null) await clearRemoteGathering(code);
  } catch { /* Retain unproven recovery evidence and let the caller preserve the original failure. */ }
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

/** Recover landed copy actions and advisory remedies across either side of the switch. */
export async function readRemoteCopyReport(code: RefBackendContext): Promise<MigrateReport> {
  const ref = copiedRoot + "report", tip = (await readSyncRefs(code, ref)).get(ref);
  if (!tip) return remoteCopyReport(new Map(), new Map(), []);
  const object = (await readBatchObjects(code, [tip])).get(tip);
  if (object?.type !== "blob") throw new Error("A forwarded remote move has no retained copy report");
  return MigrateReportSchema.parse(JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(object.bytes)));
}

/** Capture this clone's last comparison heads before a source listing. */
export async function captureMoveHeads(code: RefBackendContext, remote: MoveRemote): Promise<Map<string, string>> {
  const physical = await readRefRepository(code.repository?.source ?? code), captured = new Map<string, string>();
  for (const [root, kind] of [[`refs/arc-remotes/${remote.name}/`, "tracking"], [`refs/arc/tmp/seen/${remote.name}/`, "seen"]] as const) {
    for (const [ref, tip] of await readSyncRefs(physical, root)) captured.set(`${kind}/${ref.slice(root.length)}`, tip);
  }
  return captured;
}

/** Require the recorded move version to remain in a destination registry’s history. */
export async function registryHoldsMove(code: RefBackendContext, move: string, registry: string): Promise<boolean> {
  if ((await readBatchObjects(code, [move])).get(move)?.type !== "commit") return false;
  return syncRefIsAncestor(code, move, registry);
}

async function retainDeletedRecord(code: RefBackendContext, tip?: string): Promise<void> {
  if (!tip) return;
  const before = (await readSyncRefs(code, deletedRecordRef)).get(deletedRecordRef) ?? null;
  await requireLayoutTransaction(code, [{ ref: deletedRecordRef, next: tip, expected: before }]);
}

/** Read the project identity held by a captured registry without adopting it. */
export async function copyProjectId(code: RefBackendContext, refs: ReadonlyMap<string, string>): Promise<string | undefined> {
  const owner = projectOwnerFromObjects(refs, await readBatchObjects(code, projectIdentityQueries(refs)));
  if (owner.status === "refused") throw new MigrationRefusal({ code: "store", refusal: owner.refusal });
  return owner.result.type === "project" ? owner.result.uid : undefined;
}

/** Read copied state or comparison heads as canonical state ref names. */
export async function readCopiedRemoteRefs(code: RefBackendContext, part: "state" | "tracking" | "seen"): Promise<Map<string, string>> {
  const root = copiedRoot + part + "/";
  return new Map([...(await readSyncRefs(code, root))].map(([ref, tip]) => ["refs/arc/" + ref.slice(root.length), tip]));
}

/** Only a keeper retained by this copy can support its ended record's restoration notice. */
export async function readCopiedDeletedRecord(code: RefBackendContext): Promise<{ ref: string; tip: string } | undefined> {
  const copied = copiedRoot + "deleted-record", refs = await readSyncRefs(code, [deletedRecordRef, copied]);
  const tip = refs.get(deletedRecordRef);
  return tip && tip === refs.get(copied) ? { ref: deletedRecordRef, tip } : undefined;
}

async function saveRemoteCopyRecord(code: RefBackendContext, record: RemoteMoveRecord, prior?: RecordedRemote): Promise<RecordedRemote> {
  await code.migrateStep?.("remote.record");
  if (!prior) await clearMigrationRefs(code, deletedRecordRef);
  return saveMoveRecord(code, record, prior?.tip ?? null);
}

/** Advance the delete basis only after its re-copy landed, preserving switch heads and deleted controls. */
export async function retainRemoteCopiedState(code: RefBackendContext, source: ReadonlyMap<string, string>, report: MigrateReport): Promise<void> {
  const root = copiedRoot + "state/", prior = await readSyncRefs(code, root);
  const reportRef = copiedRoot + "report", expectedReport = (await readSyncRefs(code, reportRef)).get(reportRef) ?? null;
  const reportTip = await writeRefBlob(code, JSON.stringify(MigrateReportSchema.parse(report)));
  const next = new Map([...source].filter(([ref]) => ref !== FORWARDING_REF).map(([ref, tip]) => [root + ref.slice("refs/arc/".length), tip]));
  await requireLayoutTransaction(code, [{ ref: reportRef, next: reportTip, expected: expectedReport }, ...[...next].map(([ref, next]) => ({ ref, next, expected: prior.get(ref) ?? null })),
    ...[...prior].filter(([ref]) => !next.has(ref)).map(([ref, expected]) => ({ ref, expected, delete: true as const }))]);
}
