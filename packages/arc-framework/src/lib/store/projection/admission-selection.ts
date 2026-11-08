/** Repeat exact indexed binding or complete unindexed selection from frozen local inputs. */
import { identifyArcFileAddress } from "../../layout/index.js";
import { classifyStoreAddress } from "../target-classification.js";
import { RecordReferenceSchema, type RecordReference } from "../identity.js";
import type { Store } from "../contract.js";
import type { StoreResult } from "../refusal.js";
import type { ProjectionAdmission } from "../projection-admission.js";
import { resolveBacklogOwnership, type BacklogOwnershipInput } from "./container-ownership.js";
import { resolveLocatedAdoption } from "./adoption-target.js";
import type { ProjectionSelectionContext } from "./selection-context.js";

/** Local preparation request before it has produced a ready receipt. */
export type ProjectionPreparationRequest = Omit<ProjectionAdmission, "prepared">;

/** Recompute all selection rules rather than accepting an asserted prior selected UID. */
export async function selectProjectionAdmissionSubject(store: Store, request: ProjectionPreparationRequest): Promise<StoreResult<RecordReference>> {
  if (request.selection.kind === "indexed") return { status: "ok", result: request.selection.reference };
  const local = request.local;
  const root: ProjectionSelectionContext = { store, checkout: ".", identity: request.editingIdentity,
    claim: local.claim, layoutActive: local.layoutActive, context: { verb: "write-back" }, local };
  const index: BacklogOwnershipInput["index"] = { entries: Object.fromEntries(local.indexedMetadata.map(item =>
    [item.path, { kind: "record" as const, reference: item.reference }])) };
  const located = identifyArcFileAddress(local.path);
  if (!local.path.startsWith(".arc/backlog/") || located?.kind === "cohort-document" || located?.kind === "inbox") {
    const resolved = await resolveLocatedAdoption(root, index, local.path);
    return resolved.kind === "reference" ? { status: "ok", result: resolved.reference }
      : selectionRefusal(resolved.mark.reason, resolved.mark.remedy);
  }
  const owned = await resolveBacklogOwnership({ checkout: ".", identity: root.identity, path: local.path, store, index, local });
  if (owned.kind === "refused") return selectionRefusal(owned.mark.reason, owned.mark.remedy);
  if (owned.kind === "prospective") return selectionRefusal("Prospective metadata must mint through its verb before preparing a content put.",
    { text: "Finish stub minting, recapture its exact index binding and prepare the authored edit again." });
  const address = identifyArcFileAddress(local.path, { workItem: owned.container });
  const target = address === null ? null : classifyStoreAddress(address);
  if (target === null || target.kind === "cohort/document") return selectionRefusal("The captured path has no adoptable content address.",
    { text: "Move the edit into an established work-item folder and prepare it again." });
  return { status: "ok", result: RecordReferenceSchema.parse({ kind: target.kind, owner: owned.record.reference.owner,
    ...(target.key === undefined ? {} : { key: target.key }) }) };
}

function selectionRefusal(condition: string, remedy: import("../refusal.js").Remedy): StoreResult<never> {
  return { status: "refused", refusal: { code: "record-malformed", class: "recoverable", rule: "projection.selection", condition, remedy } };
}
