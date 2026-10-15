/** Store-backed prepare/apply ceremony for one work unit's dependency and reference repairs. */
import type { Store } from "../store/contract.js";
import { recordPut, workUnitMetaPath } from "../store/lifecycle-write.js";
import { writeMetaDependsOn } from "../store/kinds/meta/writers.js";
import { checkAdvancingPause } from "../store/lifecycle-pause.js";
import { applyPreparedLifecycleWrite, revalidateLifecycleRecords } from "./prepared-lifecycle-write.js";
import { createStoreReconcilePrepareContext } from "./store-reconcile-context.js";
import { prepareCurrentWuReconcile, type CurrentWuReconcileCeremony, type CurrentWuReconcileResult,
  type PreparedCurrentWuReconcile } from "./side-effects/discharge-dep-edges.js";

/** Bind complete record acquisition and one version-bound atomic apply. */
export function buildStoreCurrentWuReconcile(store: Store): CurrentWuReconcileCeremony {
  return {
    prepare: async (op) => {
      const acquired = await createStoreReconcilePrepareContext(store, op.slug);
      if (acquired.status === "refused") throw new Error(`${acquired.refusal.condition} ${acquired.refusal.remedy.text}`);
      const { primary } = acquired.result;
      const result = await prepareCurrentWuReconcile(acquired.result.context, {
        ...op, slug: primary.reference.owner.name, metaPath: workUnitMetaPath(primary),
      });
      const writes = result.prepared.edits.map((edit) => {
        const record = acquired.result.byPath.get(edit.path);
        if (record === undefined) throw new Error(`Prepared edit ${edit.path} lacks its acquired record`);
        const content = record.reference.kind === "work-item/meta"
          ? writeMetaDependsOn(edit.content, [...result.prepared.plan.dependency.after]) : edit.content;
        return recordPut(record, { content });
      });
      result.prepared.storePlan = { records: acquired.result.records, writes };
      return result;
    },
    apply: (prepared) => applyStoreCurrentWuReconcile(store, prepared),
  };
}
/** Apply the record plan without touching the checkout's artifacts or index. */
export async function applyStoreCurrentWuReconcile(store: Store, prepared: PreparedCurrentWuReconcile): Promise<CurrentWuReconcileResult> {
  const pause = await checkAdvancingPause(store, prepared.slug);
  if (pause.status === "rejected") return { status: "conflict", prepared, reason: pause.refusal === undefined ? "paused" : "stale-content",
    ...(pause.refusal === undefined ? {} : { refusal: pause.refusal }), ...(pause.remedy === undefined ? {} : { remedy: pause.remedy }) };
  if (prepared.plan.status === "conflict") return { status: "conflict", prepared,
    reason: prepared.plan.dependency.conflicts[0]?.reason ?? "reference-history-conflict" };
  const plan = prepared.storePlan;
  if (plan === undefined) throw new Error("Store reconcile requires its complete prepared record basis");
  if (plan.writes.length === 0) {
    const valid = await revalidateLifecycleRecords(store, plan.records);
    if (valid.status === "refused") return { status: "conflict", prepared, reason: "stale-content", refusal: valid.refusal };
    return { status: prepared.plan.advisories.length === 0 ? "clean" : "pending", prepared };
  }
  const result = await applyPreparedLifecycleWrite(store, plan, { verb: "wu-reconcile", lifecycleAction: "reconcile" });
  if (result.status === "refused") return { status: "conflict", prepared, reason: "stale-content", refusal: result.refusal };
  return { status: "applied", prepared, stagedPaths: [] };
}
