/** Decode an owner's primary coordinate from live or completed lookup metadata. */
import { RecordReferenceSchema, type RecordReference } from "../identity.js";
import { expandStoredPath } from "../stored-path.js";
import type { RefBackendContext } from "./context.js";
import type { RefLookupTree } from "./lookup.js";
import { matchesFamilyRef, refOwner } from "./codec.js";

/** A retained metadata file names an owner only while its primary path is present. */
export function lookupPrimary(context: Pick<RefBackendContext, "registry">, ref: string, tree: RefLookupTree): RecordReference | null {
  ref = tree.liveRef ?? ref;
  const cohort = matchesFamilyRef(ref, "cohort");
  if (!cohort && !matchesFamilyRef(ref, "work-item")) return null;
  const kind = cohort ? "cohort/document" : tree.metadata.primary?.role;
  if (!kind) return null;
  const reference = RecordReferenceSchema.parse({ owner: refOwner(ref, cohort ? "cohort" : "work-item", tree.metadata), kind });
  return tree.entries.some(({ path }) => path === expandStoredPath(reference, { registry: context.registry }).path) ? reference : null;
}
