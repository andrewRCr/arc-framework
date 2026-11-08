/** Bind shared project files to the selected store's established project identity. */
import { ProjectIdentityError, readProjectIdentityBinding } from "../project-identity.js";
import { recordReferences } from "../identity.js";
import type { ProjectionSelectionContext } from "./selection-context.js";
import type { AdoptionReference } from "./adoption-target.js";
import { markStoreRefusal } from "./refusal-mark.js";

/** A project inbox creates no project owner; its namespace comes from the existing registry identity. */
export async function resolveProjectInboxAdoption(root: ProjectionSelectionContext): Promise<AdoptionReference> {
  try {
    const binding = await readProjectIdentityBinding(root.store);
    return { kind: "reference", reference: recordReferences["project-inbox/inbox"](binding.owner) };
  } catch (error) {
    if (!(error instanceof ProjectIdentityError)) throw error;
    const failure = error.failure;
    return { kind: "refused", mark: failure.refusal === undefined ? { reason: failure.reason, remedy: failure.remedy }
      : markStoreRefusal(failure.refusal, root.context.verb) };
  }
}
