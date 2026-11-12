/** Identity-ref admission, addressing, and refusal helpers. */
import type { InRepoContext } from "./context.js";
import { OwnerIdentitySchema, recordReferences, RecordReferenceSchema, type RecordReference } from "../identity.js";
import type { KindId } from "../catalog.js";
import type { TransientIdentityRecord } from "../../errand/identity-record.js";
import type { ErrandRecordIO } from "../../errand/ref-tree.js";
import { notFound, refuse, unsupported } from "./refusals.js";

/** Bind identity operations to this checkout without consulting a remote.
 * @param context - Backend dependencies.
 * @returns Configured identity I/O, or null when no identity is configured.
 */
export async function transientIO(context: InRepoContext): Promise<ErrandRecordIO | null> {
  const identity = await context.ports.identity();
  if (identity === null) return null;
  return { identity,
    exec: (command, args, options) => context.ports.exec(command, args, { ...options, cwd: context.ports.checkoutRoot, objectAccess: "local-only" }),
    execInput: (args, input, options) => context.ports.execInput(args, input, { ...options, cwd: context.ports.checkoutRoot, objectAccess: "local-only" }) };
}
/** Determine the registry role of a valid identity record.
 * @param record - Decoded current record.
 * @returns Its single family-qualified role.
 */
export function transientKind(record: TransientIdentityRecord): KindId {
  return record.kind === "groom" ? "claims/groom" : record.purpose === "housekeep-routing" ? "claims/housekeep" : "work-item/record";
}
/** Construct the logical handle of an identity tree entry.
 * @param kind - Identity-ref role.
 * @param key - Entry's slug.
 * @param identity - Owning configured person.
 * @returns A path-free record reference.
 */
export function transientReference(kind: KindId, key: string, identity: string): RecordReference {
  if (kind === "work-item/record") return recordReferences[kind](OwnerIdentitySchema.parse({ type: "work-item", name: key }));
  return RecordReferenceSchema.parse({ kind, owner: { type: "person", name: identity }, key });
}
/** Read the identity tree key named by a reference.
 * @param reference - Identity role reference.
 * @returns Its slug key.
 */
export function transientKey(reference: RecordReference): string {
  if (reference.kind === "work-item/record") return reference.owner.name;
  if (typeof reference.key !== "string") throw new Error("Identity claim has no slug key");
  return reference.key;
}
/** Enforce the in-repo owner generation boundary.
 * @param reference - Requested logical record.
 * @param identity - Configured person, if any.
 * @returns Nothing when the request is admitted.
 */
export function admitTransient(reference: RecordReference, identity: string | null): void {
  if (identity === null) refuse({ code: "not-found", class: "recoverable", reference, condition: "No identity is configured.", remedy: { text: "Set arc.identity, then retry this operation." } });
  if (reference.owner.type !== "person" && reference.owner.uid !== undefined) unsupported("rename", "This backend has no work-item UID or rename support.", "No current verb renames an Errand; use its existing slug.");
  if (reference.owner.type === "person" && reference.owner.name !== identity) notFound(reference, "Select the configured arc.identity's records, then retry.");
}
/** Refuse malformed authority with a concrete manual repair route.
 * @param reference - Invalid logical entry.
 * @param rule - Decoder or size rule that rejected it.
 * @returns Never.
 */
export function transientMalformed(reference: RecordReference, rule: string): never {
  return refuse({ code: "record-malformed", class: "recoverable", reference, rule, condition: `${transientKey(reference)}: ${rule}`,
    remedy: { text: "Hand repair the named identity-ref entry to valid v3 bytes, then retry." } });
}
/** Refuse a blob that names a different identity key.
 * @param reference - Expected handle.
 * @param slug - Slug the content actually names.
 * @param identity - Configured person.
 * @returns Never.
 */
export function transientMismatch(reference: RecordReference, slug: string, identity: string): never {
  return refuse({ code: "identity-mismatch", class: "recoverable", expected: reference,
    actual: transientReference(reference.kind, slug, identity), condition: `Entry ${transientKey(reference)} names slug ${slug}`,
    remedy: { text: "Hand rewrite the identity-ref entry so its slug matches its key, then retry." } });
}
