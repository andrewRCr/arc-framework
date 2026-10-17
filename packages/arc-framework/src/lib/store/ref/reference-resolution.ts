/** Bind typed name-only references through the shared captured lookup tiers. */
import { RecordReferenceSchema, OwnerIdentitySchema, type RecordReference } from "../identity.js";
import type { ListInput } from "../read.js";
import type { StoreResult } from "../refusal.js";
import type { RefBackendContext } from "./context.js";
import { type RefLookupTree } from "./lookup.js";
import { preferredNameTrees } from "./lookup-primary.js";
import { readCapturedLookupTrees } from "./lookup-trees.js";
import { isArchiveRef } from "./archive-read.js";
import { resolveLineageReadReference, lineageOwnerCandidates } from "./lineage-resolution.js";
import { matchesFamilyRef, rootFamily, refOwner } from "./codec.js";
import { checkRefKey } from "./path-admission.js";

/** A concrete owner needs no scan; names bind only within their declared owner namespace. */
export function resolveCapturedReference(context: Pick<RefBackendContext, "registry">, reference: RecordReference,
  trees: ReadonlyMap<string, RefLookupTree>): StoreResult<RecordReference> {
  const owner = reference.owner;
  if (owner.type === "person" || owner.type === "project" || owner.uid) return { status: "ok", result: reference };
  if (reference.kind === "lineage/transition") return resolveCapturedLineage(reference, trees);
  const family = owner.type === "cohort" ? "cohort" : "work-item";
  const own = new Map([...trees].filter(([ref, tree]) => matchesFamilyRef(tree.liveRef ?? ref, family)));
  const candidates = preferredNameTrees(context, own, owner.name, false).map(([ref, tree]) => {
    const primary = ["work-item/meta", "work-item/record"].includes(reference.kind);
    return RecordReferenceSchema.parse({ ...reference, owner: refOwner(tree.liveRef ?? ref, family, tree.metadata),
      ...(primary ? { kind: tree.metadata.primary?.role ?? reference.kind } : {}) });
  });
  if (candidates.length > 1) return { status: "refused", refusal: { code: "ambiguous-match", class: "recoverable", candidates,
    condition: "More than one captured owner holds this name.", remedy: { text: "Name the intended owner by UID, then retry." } } };
  const resolved = candidates[0];
  if (!resolved) return { status: "refused", refusal: checkRefKey(reference, context.registry) ?? {
    code: "not-found", class: "recoverable", reference, condition: "No captured owner holds this name.",
    remedy: { text: "Pull state or name the owner by UID, then retry." } } };
  const invalid = checkRefKey(resolved, context.registry);
  return invalid ? { status: "refused", refusal: invalid } : { status: "ok", result: resolved };
}

/** Read lookup evidence solely from the operation's already captured namespace. */
export async function resolveRefName(context: RefBackendContext, reference: RecordReference,
  tips: ReadonlyMap<string, string>): Promise<StoreResult<RecordReference>> {
  const owner = reference.owner;
  if (owner.type === "person" || owner.type === "project" || owner.uid) return { status: "ok", result: reference };
  if (reference.kind.startsWith("lineage/")) return resolveLineageReadReference(context, reference, tips);
  const family = owner.type === "cohort" ? "cohort" : "work-item";
  const selected = new Map([...tips].filter(([ref]) => matchesFamilyRef(ref, family) || isArchiveRef(ref)));
  const trees = await readCapturedLookupTrees(context, selected);
  return trees.status === "refused" ? trees : resolveCapturedReference(context, reference, trees.result);
}

/** Name-only owner filters bind before listing, while unknown names keep an empty selection. */
export async function resolveRefListInput(context: RefBackendContext, input: ListInput,
  tips: ReadonlyMap<string, string>): Promise<StoreResult<ListInput>> {
  const reference = listOwnerReference(input);
  if (!reference) return { status: "ok", result: input };
  return bindListInput(input, await resolveRefName(context, reference, tips));
}

/** Apply the same owner tiers to already captured record and write-check listings. */
export function resolveCapturedListInput(context: Pick<RefBackendContext, "registry">, input: ListInput,
  trees: ReadonlyMap<string, RefLookupTree>): StoreResult<ListInput> {
  const reference = listOwnerReference(input);
  return reference ? bindListInput(input, resolveCapturedReference(context, reference, trees)) : { status: "ok", result: input };
}

/** Return the typed owner reference whose name a listing must bind. */
export function listOwnerReference(input: ListInput): RecordReference | null {
  const owner = input.owner;
  if (!owner || owner.type === "person" || owner.type === "project" || owner.uid) return null;
  if (input.family === "lineage" && owner.type === "work-item") return RecordReferenceSchema.parse({ owner, kind: "lineage/transition" });
  if (rootFamily(input.family) !== owner.type) return null;
  return RecordReferenceSchema.parse({ owner, kind: owner.type === "work-item" ? "work-item/meta" : "cohort/document" });
}

function bindListInput(input: ListInput, resolved: StoreResult<RecordReference>): StoreResult<ListInput> {
  if (resolved.status === "ok") return { status: "ok", result: { ...input, owner: resolved.result.owner } };
  return resolved.refusal.code === "not-found" ? { status: "ok", result: input } : resolved;
}

function resolveCapturedLineage(reference: RecordReference, trees: ReadonlyMap<string, RefLookupTree>): StoreResult<RecordReference> {
  const live = [...trees].flatMap(([ref, tree]) => matchesFamilyRef(ref, "work-item") ? [refOwner(ref, "work-item", tree.metadata)] : []);
  const lineage = Object.entries(trees.get("refs/arc/project/registry")?.metadata.lineage ?? {})
    .map(([uid, name]) => OwnerIdentitySchema.parse({ type: "work-item", uid, name }));
  const candidates = lineageOwnerCandidates(reference, live, lineage);
  if (candidates.length > 1) return { status: "refused", refusal: { code: "ambiguous-match", class: "recoverable",
    candidates: candidates.map((owner) => RecordReferenceSchema.parse({ ...reference, owner })),
    condition: "More than one captured lineage origin holds this name.", remedy: { text: "Name the intended origin by UID, then retry." } } };
  const owner = candidates[0];
  return owner ? { status: "ok", result: RecordReferenceSchema.parse({ ...reference, owner }) } : { status: "refused", refusal: {
    code: "not-found", class: "recoverable", reference, condition: "No captured live or lineage owner holds this name.",
    remedy: { text: "Pull state or name the origin by UID, then retry." } } };
}
