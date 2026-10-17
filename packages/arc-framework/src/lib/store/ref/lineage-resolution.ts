/** Lineage origins resolved independently of their absent work-item refs. */

import { OwnerIdentitySchema, RecordReferenceSchema, type OwnerIdentity, type RecordReference } from "../identity.js";
import type { StoreResult } from "../refusal.js";
import type { RefBackendContext } from "./context.js";
import { readBatchObjects, readRefTips } from "./batch-read.js";
import { parseRefMetadata, metadataFailure } from "./metadata.js";
import { readLiveRefOwners } from "./live-owners.js";

/** Read the registry's UID-to-slug map from the caller's captured namespace. */
export async function readLineageOwners(context: RefBackendContext, tips: ReadonlyMap<string, string>): Promise<StoreResult<OwnerIdentity[]>> {
  const ref = "refs/arc/project/registry";
  const tip = tips.get(ref);
  if (!tip) return { status: "ok", result: [] };
  const query = `${tip}:metadata-registry.json`;
  const objects = await readBatchObjects(context, [query]);
  const metadata = parseRefMetadata(objects.get(query), ref);
  if (!metadata) return { status: "refused", refusal: { code: "namespace-corrupt", class: "terminal", namespace: ref, ...metadataFailure(ref) } };
  return { status: "ok", result: Object.entries(metadata.lineage ?? {}).map(([uid, name]) => OwnerIdentitySchema.parse({ type: "work-item", uid, name })) };
}

/** Select live origins first, falling back to registry history only when no live owner matches. */
export function lineageOwnerCandidates(reference: RecordReference, live: readonly OwnerIdentity[], lineage: readonly OwnerIdentity[]): OwnerIdentity[] {
  const requested = reference.owner;
  if (requested.type !== "work-item") return [];
  const matches = (owner: OwnerIdentity) => owner.type === "work-item"
    && (requested.uid ? owner.uid === requested.uid : owner.name === requested.name);
  const current = live.filter(matches);
  return current.length > 0 ? current : lineage.filter(matches);
}

/** Resolve a transition by live ownership and then registry history; conflict paths need no owner UID. */
export async function resolveLineageReadReference(context: RefBackendContext, reference: RecordReference): Promise<StoreResult<RecordReference>> {
  if (reference.kind === "lineage/conflict-record" || reference.owner.type !== "work-item" || reference.owner.uid) return { status: "ok", result: reference };
  const tips = await readRefTips(context);
  const live = await readLiveRefOwners(context, tips);
  if (live.status === "refused") return live;
  const lineage = await readLineageOwners(context, tips);
  if (lineage.status === "refused") return lineage;
  const candidates = lineageOwnerCandidates(reference, live.result.map(({ owner }) => owner), lineage.result);
  if (candidates.length > 1) return { status: "refused", refusal: {
    code: "ambiguous-match", class: "recoverable", candidates: candidates.map((owner) => RecordReferenceSchema.parse({ ...reference, owner })),
    condition: "More than one lineage origin holds this name.", remedy: { text: "Name the intended origin by UID, then retry." },
  } };
  const owner = candidates[0];
  if (!owner) return { status: "refused", refusal: {
    code: "not-found", class: "recoverable", reference, condition: "No live or lineage owner holds this name.",
    remedy: { text: "Pull state or name the origin by UID, then retry." },
  } };
  return { status: "ok", result: RecordReferenceSchema.parse({ ...reference, owner }) };
}
