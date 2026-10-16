/** Legacy-shaped backlog diagnostic coordinates sourced from record identity. */
import { SlugSchema, validateManagedPath } from "../kernel/index.js";
import { dirname } from "node:path";
import { materializeArcPath, resolveArcPath } from "../layout/index.js";
import type { BacklogStub } from "../work-unit/backlog-stub.js";
import type { Store } from "./contract.js";
import { readWorkUnit, workUnitMetaPath } from "./lifecycle-write.js";
import { recordReferences } from "./identity.js";
import { lifecycleRecordPath } from "./lifecycle-record-path.js";

/** Project a new stub's diagnostic path from its logical creation coordinates.
 * @param name - Work-unit slug.
 * @param commitment - Requested backlog tier.
 * @param cohort - Optional validated cohort path.
 * @returns The metadata projection path; it grants no file-write authority.
 */
export function projectLifecycleStubMetaPath(name: string, commitment: "planned" | "provisional", cohort?: string): string {
  return resolveArcPath({ kind: "work-unit-artifact", slug: SlugSchema.parse(name), artifact: "meta",
    placement: { kind: "backlog", commitment, cohort: (cohort ?? "").split("/").filter(Boolean).map((part) => SlugSchema.parse(part)) } });
}

/** Resolve a backlog work unit and its draft through logical lookup.
 * @param store - Invocation-owned operational store.
 * @param cwd - Root used only to materialize returned diagnostic paths.
 * @param slug - Current or former work-unit slug.
 * @returns Projected backlog coordinates, or absence outside backlog.
 */
export async function readLifecycleStub(store: Store, cwd: string, slug: string): Promise<BacklogStub | null> {
  const meta = await readWorkUnit(store, slug);
  if (meta.status === "refused") {
    if (meta.refusal.code === "not-found") return null;
    throw new Error(`${meta.refusal.condition} ${meta.refusal.remedy.text}`);
  }
  const placement = meta.result.placement;
  if (placement?.kind !== "backlog") return null;
  const metaPath = materializeArcPath(cwd, validateManagedPath(workUnitMetaPath(meta.result)));
  const draft = await store.read({ reference: recordReferences["work-item/draft"](meta.result.reference.owner) });
  if (draft.status === "refused" && draft.refusal.code !== "not-found") throw new Error(`${draft.refusal.condition} ${draft.refusal.remedy.text}`);
  const draftPath = draft.status === "ok" ? lifecycleRecordPath(meta.result, draft.result) : null;
  return { slug: meta.result.reference.owner.name, stateDir: placement.commitment, metaPath, dir: dirname(metaPath),
    draftPath: draftPath === null ? null : materializeArcPath(cwd, validateManagedPath(draftPath)) };
}
