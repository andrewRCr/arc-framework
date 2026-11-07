/** Bind an unindexed Errand description to its exact role and lifecycle coordinates. */
import { resolveArcPath, type ArcLayoutAddress } from "../../layout/index.js";
import { ErrandReadPlacementSchema } from "../placement.js";
import type { StoreRecord } from "../read.js";
import type { AdoptionReference } from "./adoption-target.js";
import type { ProjectionRootState } from "./process-state.js";
import { readArchivedOwners } from "./archived-owners.js";
import { markStoreRefusal } from "./refusal-mark.js";

type ErrandAddress = Extract<ArcLayoutAddress, { kind: "errand-description" }>;

/** Completed Errands select by quarter and slug; active descriptions retain their projected location. */
export async function resolveErrandAdoption(root: ProjectionRootState, path: string, address: ErrandAddress): Promise<AdoptionReference> {
  if (address.placement.kind === "completed") {
    const listed = await readArchivedOwners(root.store, "work-item/record");
    if (listed.kind === "refused") return listed;
    const matching = listed.records.filter(record => matchesErrand(record, path, address));
    const only = matching.length === 1 ? matching[0] : undefined;
    return only === undefined ? missingErrand(path) : bindDescription(only);
  }
  const found = await root.store.lookup({ kind: "slug", slug: address.slug });
  if (found.status === "refused") return found.refusal.code === "not-found" ? missingErrand(path)
    : { kind: "refused", mark: markStoreRefusal(found.refusal) };
  const read = await root.store.read({ reference: found.result.reference });
  if (read.status === "refused") return { kind: "refused", mark: markStoreRefusal(read.refusal) };
  return matchesErrand(read.result, path, address) ? bindDescription(read.result) : missingErrand(path);
}

function matchesErrand(record: StoreRecord, path: string, address: ErrandAddress): boolean {
  if (record.reference.kind !== "work-item/record" || record.reference.owner.name !== address.slug) return false;
  const parsed = ErrandReadPlacementSchema.safeParse(record.placement);
  if (!parsed.success || parsed.data.kind !== address.placement.kind) return false;
  const placement = parsed.data.kind === "completed" ? parsed.data : address.placement;
  return resolveArcPath({ kind: "errand-description", slug: address.slug, placement }) === path;
}

function bindDescription(record: StoreRecord): AdoptionReference {
  return { kind: "reference", reference: { ...record.reference, kind: "work-item/description" } };
}

function missingErrand(path: string): Extract<AdoptionReference, { kind: "refused" }> {
  return { kind: "refused", mark: { reason: `No unique Errand record is established at ${path}.`,
    remedy: { text: "Restore the Errand's primary at the named lifecycle coordinates, or move the file to its canonical location, then retry." } } };
}
