/** End origins with lineage only after checks have seen the caller's prepared writes. */

import type { RefChange } from "../../git/ref-transaction.js";
import { RecordReferenceSchema, sameOwner, type RecordReference } from "../identity.js";
import { expandStoredPath } from "../stored-path.js";
import type { StoreResult } from "../refusal.js";
import type { RefBackendContext } from "./context.js";
import { readRefTrees } from "./batch-read.js";
import type { RefWriteGroup } from "./write-commits.js";
import type { ResolvedBatch, RefWriteTarget } from "./write-resolution.js";

/** A lineage write also observes and locks its origin, even when it removed its primary earlier. */
export function retirementTargets(context: Pick<RefBackendContext, "registry">, batch: ResolvedBatch): RefWriteTarget[] {
  return batch.writes.filter(({ mutation }) => mutation.reference.kind === "lineage/transition").map(({ mutation }) => {
    const reference = RecordReferenceSchema.parse({ owner: mutation.reference.owner, kind: "work-item/meta" });
    return { reference, home: expandStoredPath(reference, { registry: context.registry }) };
  });
}

/** Reserve the history destination of every origin this batch can end. */
export function retirementLockRefs(targets: readonly RefWriteTarget[]): string[] {
  return targets.filter(({ home }) => /^refs\/arc\/work\//u.test(home.ref)).map(({ home }) => home.ref.replace("refs/arc/", "refs/arc/history/"));
}

/** One live origin whose final tree must be swept and retained under its UID. */
export interface RefRetirementPlan { live: string; history: string }

/** Classify ends from the complete proposed batch, rejecting origin puts that would be swept. */
export async function planRefRetirements(context: RefBackendContext, batch: ResolvedBatch, targets: readonly RefWriteTarget[],
  groups: ReadonlyMap<string, RefWriteGroup>): Promise<StoreResult<RefRetirementPlan[]>> {
  if (![...groups.keys()].some((ref) => /^refs\/arc\/work\//u.test(ref) && batch.tips.has(ref))) return { status: "ok", result: [] };
  const registryRef = "refs/arc/project/registry", registryTip = batch.tips.get(registryRef);
  const registry = groups.get(registryRef)?.entries;
  const captured = !registry && registryTip ? await readRefTrees(context, new Map([[registryRef, registryTip]])) : undefined;
  if (!registry && registryTip && !captured?.has(registryRef)) return { status: "refused", refusal: { code: "namespace-corrupt", class: "terminal", namespace: registryRef,
    condition: "The lineage registry tree is unavailable.", remedy: { text: `Restore or fetch the missing objects for ${registryRef}, then retry retirement.` } } };
  const lineagePaths = new Set(registry ? registry.keys() : captured?.get(registryRef)?.map(({ path }) => path));
  const plans: RefRetirementPlan[] = [];
  for (const [ref, group] of groups) {
    if (!/^refs\/arc\/work\//u.test(ref) || !batch.tips.has(ref)) continue;
    const target = targets.find(({ home }) => home.ref === ref);
    if (!target) throw new Error("A retirement candidate has no subject");
    const lineage = RecordReferenceSchema.parse({ owner: target.reference.owner, kind: "lineage/transition" });
    if (!lineagePaths.has(expandStoredPath(lineage, { registry: context.registry }).path) || hasPrimary(context, group, target.reference)) continue;
    const createsLineage = batch.writes.some(({ mutation }) => mutation.action === "put" && mutation.expected === null
      && mutation.reference.kind === "lineage/transition" && sameOwner(mutation.reference.owner, lineage.owner));
    const put = batch.writes.find(({ mutation, home }) => home.ref === ref && mutation.action === "put"
      && !(createsLineage && mutation.reference.kind === "work-item/inbound"));
    if (put) return { status: "refused", refusal: { code: "record-malformed", class: "recoverable", reference: lineage,
      rule: "store.terminal-origin-put", condition: "This write would put another origin record while leaving terminal lineage and no primary.",
      remedy: { text: "Run abandonment or decomposition again to finish retirement, or restore the origin's primary, then retry." } } };
    plans.push({ live: ref, history: ref.replace("refs/arc/", "refs/arc/history/") });
  }
  return { status: "ok", result: plans };
}

/** Sweep both subject and conflict trees after all registered write checks admit them. */
export function sweepRefRetirements(plans: readonly RefRetirementPlan[], groups: ReadonlyMap<string, RefWriteGroup>,
  completed: ReadonlyMap<string, RefWriteGroup>): void {
  for (const { live } of plans) for (const group of [groups.get(live), completed.get(live)]) {
    if (!group) throw new Error("A retiring origin has no prepared tree");
    group.entries.clear(); group.retired = true;
  }
}

/** Move the final empty commits under history in the same ref transaction as lineage and children. */
export function retirementRefChanges(changes: readonly RefChange[], plans: readonly RefRetirementPlan[], tips: ReadonlyMap<string, string>): RefChange[] {
  const result = changes.filter(({ ref }) => !plans.some(({ live }) => live === ref));
  for (const plan of plans) {
    const change = changes.find(({ ref }) => ref === plan.live);
    if (!change || !("next" in change)) throw new Error("A retiring origin has no final commit");
    result.push({ ref: plan.history, next: change.next, expected: tips.get(plan.history) ?? null });
    const prior = tips.get(plan.live);
    if (prior) result.push({ ref: plan.live, delete: true, expected: prior });
  }
  return result;
}

function hasPrimary(context: Pick<RefBackendContext, "registry">, group: RefWriteGroup, reference: RecordReference): boolean {
  return group.metadata.primary !== undefined && group.entries.has(expandStoredPath({ ...reference, kind: group.metadata.primary.role, key: undefined },
    { registry: context.registry }).path);
}
