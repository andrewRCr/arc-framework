/** Class changes use the operational store at any lifecycle placement. */
import type { Store } from "../../store/contract.js";
import type { StoreRefusal } from "../../store/refusal.js";
import { SlugSchema, WorkClassSchema, type WorkClass } from "../../kernel/index.js";
import { resolveCurrentWorkUnit } from "../../store/current-work-unit.js";
import { batchLifecycleWrites, readWorkUnit, recordPut } from "../../store/lifecycle-write.js";
import { writeMetaClass } from "../../store/kinds/meta/writers.js";
/** Class verb invocation seams. */
export interface SetClassContext { cwd: string; store: Store }
/** A completed classification or an actionable refusal. */
export type SetClassResult = { status: "ok"; name: string; workClass: WorkClass }
  | { status: "rejected"; reason: string; refusal?: StoreRefusal };
/** Change a work unit's Class through one expected-version batch.
 * @param context - Checkout root and the operational store.
 * @param params - Optional slug and resolved Class.
 * @returns Classification or an exact store refusal.
 */
export async function runSetClass(context: SetClassContext, params: { name?: string; workClass: string }): Promise<SetClassResult> {
  const workClass = WorkClassSchema.safeParse(params.workClass);
  if (!workClass.success) return { status: "rejected", reason: "Class must be Light, Heavy, or Novel." };
  let name = params.name;
  if (name === undefined) {
    const current = await resolveCurrentWorkUnit({ cwd: context.cwd, store: context.store });
    if (current.status !== "resolved") return { status: "rejected",
      reason: `arc set-class needs exactly one current work unit; name a stub or another work unit explicitly. ${current.warnings.join(" ")}`.trim() };
    name = current.candidate.reference.owner.name;
  }
  if (!SlugSchema.safeParse(name).success) return { status: "rejected", reason: "Class changes require a work-unit slug." };
  const read = await readWorkUnit(context.store, name);
  if (read.status === "refused") return { status: "rejected", reason: read.refusal.condition, refusal: read.refusal };
  const result = await batchLifecycleWrites(context.store,
    [recordPut(read.result, { content: writeMetaClass(read.result.content, workClass.data) })],
    { verb: "set-class", lifecycleAction: "classify" });
  return result.status === "refused" ? { status: "rejected", reason: result.refusal.condition, refusal: result.refusal }
    : { status: "ok", name, workClass: workClass.data };
}
