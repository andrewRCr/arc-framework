/** Before-state resolution of prior provider generations for stub settlement. */
import type { Store } from "./contract.js";
import type { StoreRecord } from "./read.js";
import type { OwnerIdentity } from "./identity.js";
import type { WorkItemRef, LineageRecord } from "./kinds/lineage/index.js";
import type { StoreResult } from "./refusal.js";
import { SlugSchema } from "../kernel/index.js";
import { parseLineageRecord } from "./kinds/lineage/index.js";
import { readLifecycleMetaFields } from "./lifecycle-write.js";
import { sameOwner } from "./identity.js";
import { readRetiredLineage } from "./retired-lineage.js";

/** An edge can discharge or name the replacement providers of its retired target. */
export type DependencyDisposition = { kind: "drop"; reason: string } | { kind: "replace"; replacementTargets: readonly string[] };

/** One uniquely determined prior-provider disposition, with the records that proved it. */
export interface ResolvedRetiredEdge {
  priorTarget: WorkItemRef;
  disposition: DependencyDisposition;
  records: readonly StoreRecord[];
}
interface ResolvedTargets { priorTarget: WorkItemRef; targets: readonly string[]; records: readonly StoreRecord[] }
interface ResolutionContext { store: Store; dependent: OwnerIdentity }

/** Resolve the previous holder without considering the new member that will take its name. */
export async function resolveRetiredEdge(store: Store, slug: string,
  dependent: OwnerIdentity, uid?: string): Promise<StoreResult<ResolvedRetiredEdge | null>> {
  const resolved = await resolveTargets({ store, dependent }, { name: SlugSchema.parse(slug), ...(uid === undefined ? {} : { uid }) }, new Set());
  if (resolved.status === "refused") return resolved;
  if (resolved.result === null) return { status: "ok", result: null };
  const { priorTarget, targets, records } = resolved.result;
  return { status: "ok", result: { priorTarget, records, disposition: targets.length === 0
    ? { kind: "drop", reason: "The prior provider's dependency is satisfied or retired without replacements." }
    : { kind: "replace", replacementTargets: targets } } };
}

async function resolveTargets(ctx: ResolutionContext, target: WorkItemRef,
  visited: ReadonlySet<string>): Promise<StoreResult<ResolvedTargets | null>> {
  const key = target.uid ?? target.name;
  if (visited.has(key) || matchesDependent(target, ctx.dependent)) return { status: "ok", result: null };
  const lookup = await ctx.store.lookup({ kind: "slug", slug: target.name });
  if (lookup.status === "ok") {
    const selected = lookup.result.reference.owner;
    if (target.uid !== undefined && (selected.type !== "work-item" || target.uid !== selected.uid))
      return resolveRetiredTarget(ctx, target, visited);
    const primary = await ctx.store.read({ reference: lookup.result.reference });
    if (primary.status === "refused") return { status: "refused", refusal: primary.refusal };
    const owner = primary.result.reference.owner;
    if (owner.type !== "work-item" || primary.result.conflicts.length > 0) return { status: "ok", result: null };
    return resolveLive(primary.result, ctx.dependent);
  } else if (lookup.refusal.code === "ambiguous-match" && target.uid !== undefined) return resolveRetiredTarget(ctx, target, visited);
  else if (lookup.refusal.code !== "not-found") return lookup.refusal.code === "ambiguous-match"
    ? { status: "ok", result: null } : { status: "refused", refusal: lookup.refusal };
  return resolveRetiredTarget(ctx, target, visited);
}

async function resolveRetiredTarget(ctx: ResolutionContext, target: WorkItemRef,
  visited: ReadonlySet<string>): Promise<StoreResult<ResolvedTargets | null>> {
  const record = await readRetiredLineage(ctx.store, target);
  if (record.status === "refused") return record;
  if (record.result === null) return { status: "ok", result: null };
  const transition = parseLineageRecord(record.result.content);
  if (!usableTransition(transition, record.result)) return { status: "ok", result: null };
  return resolveTransition(ctx, transition, record.result, new Set([...visited, target.uid ?? target.name]));
}

function resolveLive(primary: StoreRecord, dependent: OwnerIdentity): StoreResult<ResolvedTargets | null> {
  const owner = primary.reference.owner;
  if (sameOwner(owner, dependent)) return { status: "ok", result: null };
  const fields = readLifecycleMetaFields(primary);
  if (fields.status === "refused") return { status: "refused", refusal: fields.refusal };
  const priorTarget = { name: owner.name, ...(owner.type === "work-item" && owner.uid !== undefined ? { uid: owner.uid } : {}) };
  return { status: "ok", result: { priorTarget, records: [primary],
    targets: primary.placement?.kind === "completed" || fields.result.state === "Integrating" ? [] : [owner.name] } };
}

async function resolveTransition(ctx: ResolutionContext, transition: LineageRecord, record: StoreRecord,
  visited: ReadonlySet<string>): Promise<StoreResult<ResolvedTargets | null>> {
  if (transition.kind === "abandon") return { status: "ok", result: { priorTarget: transition.origin, targets: [], records: [record] } };
  const matched = await transitionDisposition(ctx, transition);
  if (matched.status === "refused") return matched;
  const disposition = matched.result;
  if (disposition === undefined) return { status: "ok", result: null };
  if (disposition.kind === "drop") return { status: "ok", result: { priorTarget: transition.origin, targets: [], records: [record] } };
  const targets: string[] = [], records = [record];
  for (const target of disposition.replacementTargets) {
    const tail = await resolveTargets(ctx, target, visited);
    if (tail.status === "refused" || tail.result === null) return tail;
    targets.push(...tail.result.targets);
    records.push(...tail.result.records);
  }
  return { status: "ok", result: { priorTarget: transition.origin, records,
    targets: [...new Set(targets)].sort((a, b) => Buffer.compare(Buffer.from(a), Buffer.from(b))) } };
}

async function transitionDisposition(ctx: ResolutionContext, transition: LineageRecord): Promise<StoreResult<LineageRecord["incoming"][number]["disposition"] | undefined>> {
  if (transition.kind === "rename") return { status: "ok", result: { kind: "replace", replacementTargets: transition.successors } };
  const matches: LineageRecord["incoming"] = [];
  for (const entry of transition.incoming) {
    const matched = await matchHistoricalDependent(ctx, entry.dependent);
    if (matched.status === "refused") return matched;
    if (matched.result === null) return { status: "ok", result: undefined };
    if (matched.result) matches.push(entry);
  }
  return { status: "ok", result: matches.length === 1 ? matches[0]?.disposition : undefined };
}

async function matchHistoricalDependent(ctx: ResolutionContext, dependent: WorkItemRef): Promise<StoreResult<boolean | null>> {
  if (dependent.uid !== undefined && ctx.dependent.type === "work-item" && ctx.dependent.uid !== undefined)
    return { status: "ok", result: dependent.uid === ctx.dependent.uid };
  if (dependent.name === ctx.dependent.name) return { status: "ok", result: true };
  const lookup = await ctx.store.lookup({ kind: "slug", slug: dependent.name });
  if (lookup.status === "ok") return { status: "ok", result: sameOwner(lookup.result.reference.owner, ctx.dependent) };
  if (lookup.refusal.code === "not-found") return { status: "ok", result: false };
  return lookup.refusal.code === "ambiguous-match" ? { status: "ok", result: null } : { status: "refused", refusal: lookup.refusal };
}

function matchesDependent(target: WorkItemRef, dependent: OwnerIdentity): boolean {
  return target.uid !== undefined && dependent.type === "work-item" && dependent.uid !== undefined
    ? target.uid === dependent.uid : target.name === dependent.name;
}

function usableTransition(transition: LineageRecord | null, record: StoreRecord): transition is LineageRecord {
  return transition !== null && record.conflicts.length === 0;
}
