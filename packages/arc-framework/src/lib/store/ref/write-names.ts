/** Resolve write operands by the captured name tiers while reserving new generations together. */
import { RecordReferenceSchema, type RecordReference } from "../identity.js";
import type { Mutation } from "../write.js";
import type { StoreResult } from "../refusal.js";
import type { RefBackendContext } from "./context.js";
import { resolveRefName } from "./reference-resolution.js";
import { isArchiveRef } from "./archive-read.js";

/** The batch's normalized operands and names whose primaries start a fresh generation. */
export interface NamedRefWrites { writes: Mutation[]; freshNames: ReadonlySet<string> }

/** One requested owner name, independent of which record in the batch names it. */
export function writeOwnerNameKey(reference: RecordReference): string { return JSON.stringify([reference.owner.type, reference.owner.name]); }

/** Bind updates to existing generations and keep every fresh primary's companion on its new UID. */
export async function resolveNamedRefWrites(context: RefBackendContext, writes: readonly Mutation[],
  tips: ReadonlyMap<string, string>): Promise<StoreResult<NamedRefWrites>> {
  const fresh = await freshPrimaryNames(context, writes, tips);
  if (fresh.status === "refused") return fresh;
  const resolved: Mutation[] = [];
  for (const mutation of writes) {
    const bound = await bindNamedMutation(context, mutation, tips, fresh.result);
    if (bound.status === "refused") return bound;
    resolved.push(bound.result);
  }
  return { status: "ok", result: { writes: resolved, freshNames: fresh.result } };
}

async function freshPrimaryNames(context: RefBackendContext, writes: readonly Mutation[],
  tips: ReadonlyMap<string, string>): Promise<StoreResult<Set<string>>> {
  const names = new Set<string>();
  const live = new Map([...tips].filter(([ref]) => !isArchiveRef(ref)));
  for (const mutation of writes) {
    const { reference } = mutation, { owner } = reference;
    if (mutation.action !== "put" || mutation.expected !== null || owner.type === "person" || owner.type === "project" || owner.uid
      || !["work-item/meta", "work-item/record", "cohort/document"].includes(reference.kind)) continue;
    const found = await resolveRefName(context, reference, live, true);
    if (found.status === "refused" && found.refusal.code !== "not-found") return found;
    if (found.status === "refused") names.add(writeOwnerNameKey(reference));
  }
  return { status: "ok", result: names };
}

async function bindNamedMutation(context: RefBackendContext, mutation: Mutation, tips: ReadonlyMap<string, string>,
  fresh: ReadonlySet<string>): Promise<StoreResult<Mutation>> {
  const reference = await bindName(context, mutation.reference, tips, fresh);
  if (reference.status === "refused") return reference;
  const resolves: RecordReference[] = [];
  for (const conflict of mutation.resolves ?? []) {
    const bound = await bindName(context, conflict, tips, fresh);
    if (bound.status === "refused") return bound;
    resolves.push(bound.result);
  }
  return { status: "ok", result: { ...mutation, reference: reference.result, ...(mutation.resolves ? { resolves } : {}) } };
}

async function bindName(context: RefBackendContext, reference: RecordReference, tips: ReadonlyMap<string, string>,
  fresh: ReadonlySet<string>): Promise<StoreResult<RecordReference>> {
  if (reference.kind.startsWith("lineage/") || fresh.has(writeOwnerNameKey(reference))) return { status: "ok", result: reference };
  const found = await resolveRefName(context, reference, tips);
  if (found.status === "refused") return found.refusal.code === "not-found" ? { status: "ok", result: reference } : found;
  return { status: "ok", result: RecordReferenceSchema.parse({ ...reference, owner: found.result.owner }) };
}
