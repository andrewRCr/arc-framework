/** Prove current sibling ends independently of the earlier batch's tree shape. */
import { OwnerIdentitySchema, type OwnerIdentity } from "../identity.js";
import { requireWithdrawLineage } from "./sync-withdraw-lineage.js";
import { readBatchObjects, readRefTrees } from "./batch-read.js";
import type { RefBackendContext } from "./context.js";
import { isUnavailableGraphFailure } from "./history-graph.js";
import { syncRefIsAncestor } from "./sync-graph.js";
import { readItemEndCandidates, type ItemEndCandidate, type ItemEndFault } from "./sync-lifecycle-log.js";
import { UnavailableWithdrawJournal, type WithdrawJournalStep } from "./sync-withdraw-journal.js";
import type { WithdrawalBasis } from "./sync-withdraw-prepare.js";
import { archiveOwnerTrees, isArchiveRef, isArchiveMetadataPath, latestArchivedFolders, type ArchivedFolder } from "./archive-read.js";
import { archiveStateFromCapture, captureArchivedFolders } from "./ended-owners.js";
import { refPrototype } from "./read.js";
import { readRefMetadata } from "./metadata.js";
import { refObjectFault } from "./object-fault.js";

/** Keep only siblings whose current end has a distinct, later, unwithdrawn history witness. */
export async function laterSiblingEnds(context: RefBackendContext, basis: WithdrawalBasis,
  journal: readonly WithdrawJournalStep[]): Promise<Map<string, OwnerIdentity>> {
  const retained = new Map<string, OwnerIdentity>();
  const siblings = journal.filter(({ ref }) => /^refs\/arc\/history\/(?:work|cohort)\//u.test(ref)
    && ref !== basis.end.history && basis.state.has(ref) && !basis.state.has(ref.replace("refs/arc/history/", "refs/arc/")));
  if (!siblings.length) return retained;
  const prototypes = siblings.map(({ ref }) => refPrototype(context, ref.replace("refs/arc/history/", "refs/arc/"),
    ref.startsWith("refs/arc/history/work/") ? "work-item" : "cohort").owner);
  const folders = await siblingFolders(context, basis.state, prototypes);
  for (const step of siblings) {
    try {
      const original = basis.journal.find(({ ref }) => ref === step.ref)?.after, tip = basis.state.get(step.ref);
      if (!original || !tip) throw new UnavailableWithdrawJournal(step.ref, "The original contribution's history coordinate is unavailable.");
      const folder = folders.find(({ liveRef }) => liveRef === step.ref.replace("refs/arc/history/", "refs/arc/"));
      const owner = folder?.owner ?? await terminalOwner(context, basis, step.ref);
      if (!owner) continue;
      const candidates = await currentEndCandidates(context, basis, step.ref, tip, owner, folder);
      if (await hasLaterEnd(context, original, candidates, basis.batches)) retained.set(step.ref, owner);
    } catch (error) {
      if (!await isUnavailableGraphFailure(context, error)) throw error;
      throw new UnavailableWithdrawJournal(step.ref, `History required to preserve a later end on ${step.ref} is unavailable.`, "missing");
    }
  }
  return retained;
}

async function siblingFolders(context: RefBackendContext, state: ReadonlyMap<string, string>,
  owners: readonly OwnerIdentity[]): Promise<ArchivedFolder[]> {
  const quarters = new Map([...state].filter(([ref]) => isArchiveRef(ref))), trees = await readRefTrees(context, quarters);
  const selected = archiveOwnerTrees(trees, owners);
  const objects = await readBatchObjects(context, [...new Set([...selected.values()].flatMap(entries =>
    entries.filter(({ path }) => isArchiveMetadataPath(path)).map(({ oid }) => oid)))]);
  const capture = archiveStateFromCapture(quarters, trees, objects);
  const results = (["work-item", "cohort"] as const).map(family => captureArchivedFolders(capture, family, owners));
  const diagnostic = results.flatMap(result => result.diagnostics)[0];
  if (diagnostic) throw new UnavailableWithdrawJournal(diagnostic.key.split(":")[0] ?? diagnostic.key, diagnostic.condition,
    diagnostic.fault, { key: diagnostic.key, remedy: diagnostic.remedy });
  return latestArchivedFolders(results.flatMap(result => result.folders));
}

async function terminalOwner(context: RefBackendContext, basis: WithdrawalBasis, history: string): Promise<OwnerIdentity | undefined> {
  if (!history.startsWith("refs/arc/history/work/")) return;
  const ref = "refs/arc/project/registry", tip = basis.state.get(ref), uid = history.split("/").at(-1);
  if (!tip) return;
  const entries = (await readRefTrees(context, new Map([[ref, tip]]))).get(ref);
  if (!entries) throw new UnavailableWithdrawJournal(ref, "The registry tree required to establish a later terminal owner is unavailable.", "missing");
  const entry = entries.find(({ path }) => path === `lineage/${uid}.json`);
  if (!entry) return;
  const object = (await readBatchObjects(context, [entry.oid])).get(entry.oid);
  const condition = "The terminal owner's retained lineage cannot be decoded.";
  const lineage = requireWithdrawLineage(ref, entry.path, object, condition);
  if (lineage.origin.uid !== uid) throw new UnavailableWithdrawJournal(ref, condition);
  return lineage.kind === "rename" ? undefined : OwnerIdentitySchema.parse({ type: "work-item", ...lineage.origin });
}

async function currentEndCandidates(context: RefBackendContext, basis: WithdrawalBasis, ref: string, tip: string, owner: OwnerIdentity,
  folder?: ArchivedFolder): Promise<ItemEndCandidate[]> {
  const evidence = await readItemEndCandidates(context, tip, owner, folder ? "all" : "retirement");
  if (evidence.unavailable.size) throw new UnavailableWithdrawJournal(ref, "A tree required to establish the sibling's current end is unavailable.", "missing");
  if (!folder) return evidence.candidates;
  const batch = folder.metadata.endBatch;
  const fault = evidence.faults.find(candidate => batch && candidate.batch === batch);
  if (fault) throw endMetadataFault(ref, fault.commit, fault.fault);
  const candidates = evidence.candidates.filter(candidate => batch && candidate.batch === batch);
  // Another machine's published end is never in the local history, and as an independent end it keeps no sibling.
  if (!candidates.length && await publishedFolder(context, basis.incoming, owner, folder)) return [];
  if (!candidates.length) throw new UnavailableWithdrawJournal(ref, "The current archive folder's original end cannot be witnessed in its retained history.");
  const uid = "uid" in owner ? owner.uid : undefined;
  await requireEndMetadata(context, ref, candidates, `metadata-${uid}.json`, batch);
  return candidates;
}

async function requireEndMetadata(context: RefBackendContext, ref: string, candidates: readonly ItemEndCandidate[],
  path: string, batch: string | undefined): Promise<void> {
  const objects = await readBatchObjects(context, candidates.map(({ commit }) => `${commit}:${path}`));
  for (const { commit } of candidates) {
    const object = objects.get(`${commit}:${path}`);
    if (!object) {
      const entries = (await readRefTrees(context, new Map([[commit, commit]]))).get(commit);
      if (!entries || entries.some(entry => entry.path === path)) throw endMetadataFault(ref, commit, "missing");
    } else {
      const read = readRefMetadata(ref, object);
      if (read.kind === "parsed" && read.metadata.endBatch === batch) continue;
      if (read.kind === "unparseable") throw endMetadataFault(ref, commit, read.kind);
    }
    throw new UnavailableWithdrawJournal(ref, "Metadata required to establish the current archive end is unavailable or cannot be decoded.");
  }
}

function endMetadataFault(ref: string, commit: string, fault: ItemEndFault["fault"]): UnavailableWithdrawJournal {
  const { condition } = refObjectFault(ref, fault, { saved: true });
  return new UnavailableWithdrawJournal(ref, `${condition} End commit: ${commit}.`, fault, { saved: true });
}

async function publishedFolder(context: RefBackendContext, incoming: ReadonlyMap<string, string>, owner: OwnerIdentity,
  folder: ArchivedFolder): Promise<boolean> {
  const published = await siblingFolders(context, incoming, [owner]);
  return published.some(({ liveRef, metadata }) => liveRef === folder.liveRef && metadata.endBatch === folder.metadata.endBatch);
}

async function hasLaterEnd(context: RefBackendContext, original: string, candidates: readonly ItemEndCandidate[],
  batches: ReadonlySet<string>): Promise<boolean> {
  for (const candidate of candidates) if (candidate.commit !== original && !batches.has(candidate.batch)
    && await syncRefIsAncestor(context, original, candidate.commit)) return true;
  return false;
}
