/** Produce the save command's result from its completed start and current store version. */
import type { Store } from "../contract.js";
import type { StateVersion } from "../identity.js";
import type { Remedy, StoreRefusal } from "../refusal.js";
import { projectionProcessState } from "./process-state.js";
import { projectionStartRefusal } from "./start-refusal.js";
import { saveProjectionChanges } from "./save-changed.js";

/** A save-specific stop, independent of the backend's closed refusal vocabulary. */
export interface ProjectionSaveRefusal {
  readonly code: "unsupported" | "projection-not-started" | "projection-skipped" | "projection-refused" | "resolution-refused";
  readonly condition: string;
  readonly remedy: Remedy;
}
/** One whole result, including backend refusals without flattening their evidence. */
export type ProjectionSaveResult =
  | { readonly status: "ok"; readonly result: { readonly version: StateVersion } }
  | { readonly status: "refused"; readonly refusal: ProjectionSaveRefusal | StoreRefusal };

/** Read the start outcome rather than sending every file a second time. */
export async function projectionSaveResult(store: Store): Promise<ProjectionSaveResult> {
  const skip = projectionProcessState().skip;
  if (skip?.reason === "switch") return { status: "refused", refusal: { code: "projection-skipped",
    condition: skip.mark.reason, remedy: skip.mark.remedy } };
  if (!store.capabilities.stateOffBranch) return { status: "refused", refusal: { code: "unsupported",
    condition: "Projection save is unavailable with the current storage backend.",
    remedy: { text: "Use arc user save to save personal state.", argv: ["arc", "user", "save"] } } };
  const startRefusal = projectionStartRefusal("arc save");
  if (startRefusal !== null) return { status: "refused", refusal: startRefusal };
  const intent = projectionProcessState().resolution;
  if (intent !== null && !intent.accepted) return { status: "refused", refusal: { code: "resolution-refused",
    condition: intent.refusal?.reason ?? `The requested resolution ${intent.token} remains pending.`,
    remedy: intent.refusal?.remedy ?? { text: "Repair the subject file's reported condition, then retry arc save --resolve with the same token." } } };
  return saveProjectionChanges(store);
}
