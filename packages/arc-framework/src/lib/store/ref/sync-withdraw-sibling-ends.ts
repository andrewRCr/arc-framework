/** Prove current sibling ends independently of the earlier batch's tree shape. */
import { OwnerIdentitySchema, type OwnerIdentity } from "../identity.js";
import { parseLineageRecord } from "../kinds/lineage/index.js";
import { readBatchObjects, readRefTrees } from "./batch-read.js";
import type { RefBackendContext } from "./context.js";
import { isUnavailableGraphFailure } from "./history-graph.js";
import { syncRefIsAncestor } from "./sync-graph.js";
import { readItemEndCandidates, type ItemEndCandidate } from "./sync-lifecycle-log.js";
import { UnavailableWithdrawJournal, type WithdrawJournalStep } from "./sync-withdraw-journal.js";
import type { WithdrawalBasis } from "./sync-withdraw-prepare.js";
import { archiveOwnerTrees, isArchiveRef, isArchiveMetadataPath, latestArchivedFolders, type ArchivedFolder } from "./archive-read.js";
import { archiveStateFromCapture, captureArchivedFolders } from "./ended-owners.js";
import { refPrototype } from "./read.js";
import { parseRefMetadata } from "./metadata.js";

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
      const candidates = await currentEndCandidates(context, step.ref, tip, owner, folder);
      if (await hasLaterEnd(context, original, candidates, basis.batches)) retained.set(step.ref, owner);
    } catch (error) {
      if (!await isUnavailableGraphFailure(context, error)) throw error;
      throw new UnavailableWithdrawJournal(step.ref, `History required to preserve a later end on ${step.ref} is unavailable.`);
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
  if (diagnostic) throw new UnavailableWithdrawJournal(diagnostic.key.split(":")[0] ?? diagnostic.key, diagnostic.condition);
  return latestArchivedFolders(results.flatMap(result => result.folders));
}

async function terminalOwner(context: RefBackendContext, basis: WithdrawalBasis, history: string): Promise<OwnerIdentity | undefined> {
  if (!history.startsWith("refs/arc/history/work/")) return;
  const ref = "refs/arc/project/registry", tip = basis.state.get(ref), uid = history.split("/").at(-1);
  if (!tip) return;
  const entries = (await readRefTrees(context, new Map([[ref, tip]]))).get(ref);
  if (!entries) throw new UnavailableWithdrawJournal(ref, "The registry tree required to establish a later terminal owner is unavailable.");
  const entry = entries.find(({ path }) => path === `lineage/${uid}.json`);
  if (!entry) return;
  const object = (await readBatchObjects(context, [entry.oid])).get(entry.oid);
  const lineage = object?.type === "blob" ? parseLineageRecord(new TextDecoder().decode(object.bytes)) : null;
  if (!lineage || lineage.origin.uid !== uid) throw new UnavailableWithdrawJournal(ref, "The terminal owner's retained lineage cannot be decoded.");
  return lineage.kind === "rename" ? undefined : OwnerIdentitySchema.parse({ type: "work-item", ...lineage.origin });
}

async function currentEndCandidates(context: RefBackendContext, ref: string, tip: string, owner: OwnerIdentity,
  folder?: ArchivedFolder): Promise<ItemEndCandidate[]> {
  const evidence = await readItemEndCandidates(context, tip, owner, folder ? "all" : "retirement");
  if (evidence.unavailable.size) throw new UnavailableWithdrawJournal(ref, "A tree required to establish the sibling's current end is unavailable.");
  if (!folder) return evidence.candidates;
  const batch = folder.metadata.endBatch;
  const candidates = evidence.candidates.filter(candidate => batch && candidate.batch === batch);
  if (!candidates.length) throw new UnavailableWithdrawJournal(ref, "The current archive folder's original end cannot be witnessed in its retained history.");
  const uid = "uid" in owner ? owner.uid : undefined;
  const objects = await readBatchObjects(context, candidates.map(({ commit }) => `${commit}:metadata-${uid}.json`));
  if (candidates.some(({ commit }) => parseRefMetadata(objects.get(`${commit}:metadata-${uid}.json`), ref)?.endBatch !== batch)) {
    throw new UnavailableWithdrawJournal(ref, "Metadata required to establish the current archive end is unavailable or cannot be decoded.");
  }
  return candidates;
}

async function hasLaterEnd(context: RefBackendContext, original: string, candidates: readonly ItemEndCandidate[],
  batches: ReadonlySet<string>): Promise<boolean> {
  for (const candidate of candidates) if (candidate.commit !== original && !batches.has(candidate.batch)
    && await syncRefIsAncestor(context, original, candidate.commit)) return true;
  return false;
}
