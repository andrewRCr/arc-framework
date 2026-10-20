/** Generation-qualified map history and retained backend birth authentication. */
import { createHash } from "node:crypto";
import { canonicalize } from "../kernel/canonical/canonical-json.js";
import { HistoryEntrySchema, type HistoryEntry, type Store } from "../store/contract.js";
import { sameReference, type RecordReference } from "../store/identity.js";
import type { CreatedOwner } from "../store/creation-receipt.js";
import type { StoredCutOwnerBirth } from "../store/kinds/cut-map/schema.js";
import { decodeCutMapContent } from "../store/kinds/cut-map/parser.js";
import { decomposeStoreRefusal, type DecomposeResult, type DecomposeRefusal } from "./refusal.js";

/** Report unavailable generation authority without inventing a fetch for never-retained facts. */
export function unavailableDecomposeBirth(locus: string, message: string): DecomposeRefusal {
  return { status: "refused", reason: "unsupported", class: "terminal", locus, message,
    remedy: { text: "Restore authentic generation evidence from a known intact source when available; otherwise explicitly regenerate this development cut state. Then prepare a fresh preview and obtain approval." } };
}

/** Acquire only this known origin generation's complete map stream, preserving other failures. */
export async function acquireDecomposeMapHistory(store: Pick<Store, "history">, reference: RecordReference,
  knownOrigin = false): Promise<DecomposeResult<readonly HistoryEntry[]>> {
  const history = await store.history({ reference });
  if (history.status === "refused") {
    if (knownOrigin && reference.owner.type === "work-item" && reference.owner.uid !== undefined
      && history.refusal.code === "not-found" && history.refusal.lookup === undefined
      && history.refusal.reference !== undefined && sameReference(history.refusal.reference, reference)) {
      return { status: "ok", result: [] };
    }
    return decomposeStoreRefusal(history.refusal);
  }
  for (const entry of history.result) {
    const checked = HistoryEntrySchema.safeParse(entry);
    if (!checked.success) return decomposeStoreRefusal({ code: "namespace-corrupt", class: "terminal",
      namespace: `history:${reference.kind}:${reference.owner.name}`,
      condition: `Malformed advertised history evidence: ${checked.error.message}`,
      remedy: { text: "Restore authentic history from a known intact source, or explicitly regenerate this development state; then prepare again." } });
  }
  return history;
}

/** Derive a binding from the full prior event population, independent of traversal order or branch. */
export function deriveDecomposeBirthKey(reference: RecordReference, birth: Pick<StoredCutOwnerBirth, "kind" | "name">,
  history: readonly HistoryEntry[]): DecomposeResult<string> {
  const batches = new Set<string>();
  for (const entry of history) {
    if (!("verb" in entry.provenance) || entry.provenance.batchId === undefined || entry.provenance.batchId.length === 0) {
      return unavailableDecomposeBirth(reference.owner.name, "Complete prior cut-map history lacks a structured batch identity.");
    }
    batches.add(entry.provenance.batchId);
  }
  if (reference.owner.type !== "work-item" || reference.owner.uid === undefined) {
    return unavailableDecomposeBirth(reference.owner.name, "The cut-map origin has no authenticated generation.");
  }
  const ids = [...batches].sort((a, b) => Buffer.compare(Buffer.from(a), Buffer.from(b)));
  return { status: "ok", result: createHash("sha256").update(canonicalize([
    "arc.decompose.owner-birth/v1", reference.owner.uid, birth.kind, birth.name, ids,
  ]), "utf8").digest("hex") };
}

/** Prove one distinct birth UID from every retained map event carrying this selected binding. */
export function resolveDecomposeOwnerBirth(binding: StoredCutOwnerBirth,
  history: readonly HistoryEntry[]): DecomposeResult<string> {
  const uids = new Set<string>();
  for (const entry of history) {
    const receipt = matchingBirthFacts(entry, binding);
    if (receipt.status === "refused") return receipt;
    for (const birth of receipt.result) {
      if (birth.kind === binding.kind && birth.owner.name === binding.name) uids.add(birth.owner.uid);
    }
  }
  const uid = [...uids][0];
  return uids.size === 1 && uid !== undefined ? { status: "ok", result: uid }
    : unavailableDecomposeBirth(binding.name, uids.size === 0 ? "The selected binding has no authenticated birth."
      : "The selected binding proves multiple owner generations; preserve every generation and explicitly settle this cut state.");
}

function matchingBirthFacts(entry: HistoryEntry, binding: StoredCutOwnerBirth): DecomposeResult<readonly CreatedOwner[]> {
  if (entry.content === null || !("verb" in entry.provenance) || entry.provenance.verb !== "decompose") return { status: "ok", result: [] };
  const stored = decodeCutMapContent(entry.content);
  if (!stored.success) return unavailableDecomposeBirth(binding.name, `Required historical stored map is invalid: ${stored.error}`);
  if (!stored.data.ownerBirths.some(prior => prior.kind === binding.kind && prior.name === binding.name && prior.birthKey === binding.birthKey)) {
    return { status: "ok", result: [] };
  }
  return entry.creationReceipt === undefined ? unavailableDecomposeBirth(binding.name, "A matching map event has unavailable birth evidence.")
    : { status: "ok", result: entry.creationReceipt.createdOwners };
}
