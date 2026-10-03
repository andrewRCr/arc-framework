/** Genuine failure conditions shared by the test-only reference operations. */

import { type RecordReference, type StoreRefusal, type StoreResult, type LookupInput } from "../../../src/lib/store/index.js";
import { MACHINE_LOCAL_PATHS } from "../../../src/lib/store/registry.js";
import { canonicalReference, ownerNameKey, recordKey, type MemoryState } from "./model.js";

/** Wrap a successful operation payload.
 * @param result - Public contract result.
 * @returns Its common operation envelope.
 */
export function ok<T>(result: T): StoreResult<T> { return { status: "ok", result }; }

/** Wrap an actionable refusal without throwing it.
 * @param refusal - The contract's closed failure value.
 * @returns A refused operation envelope.
 */
export function refused<T>(refusal: StoreRefusal): StoreResult<T> { return { status: "refused", refusal }; }

/** Name every stale record in one compare-and-swap refusal.
 * @param records - Records whose mutation bases no longer match.
 * @returns A refusal that permits re-reading and re-applying each change.
 */
export function versionConflict(records: RecordReference[]): StoreRefusal {
  return {
    code: "version-conflict", class: "recoverable", records,
    condition: "Every named record has changed since its expected version.",
    remedy: { text: "Read each named record again and re-apply the intended change against its current version." },
  };
}

/** Report missing records, distinguishing missing identity from absent names.
 * @param reference - Requested record.
 * @param identity - Configured person, if any.
 * @returns The applicable success-path remedy.
 */
export function missingRecord(reference: RecordReference, identity: string | undefined): StoreRefusal {
  const noIdentity = reference.owner.type === "person" && identity === undefined;
  return {
    code: "not-found", class: "recoverable", reference,
    condition: noIdentity ? "No arc.identity is configured for this identity-scoped record." : "No record has the requested reference.",
    remedy: noIdentity
      ? { text: "Set arc.identity to the record owner's identity, then retry.", argv: ["git", "config", "arc.identity", reference.owner.name] }
      : { text: `Use lookup for ${reference.owner.name}, or create its record before reading it.` },
  };
}

/** Report an unsuccessful reverse lookup with its exact input.
 * @param lookup - Unmatched input.
 * @returns A refusal naming how the name can be resolved.
 */
export function missingLookup(lookup: LookupInput): StoreRefusal {
  return {
    code: "not-found", class: "recoverable", lookup,
    condition: lookup.kind === "claim" && lookup.claim.kind === "partial-errand"
      ? "A partial-protection Errand has no stored record." : "No record matches this lookup.",
    remedy: { text: "Check the requested name with lookup, or create its record before retrying." },
  };
}

/** Report failed content validation or an unreadable newer format.
 * @param reference - Record requiring repair.
 * @param rule - Observed validation or format failure.
 * @param cause - Typed failure cause determined where validation fails.
 * @returns A refusal identifying the rejected record and repair rule.
 */
export function malformed(reference: RecordReference, rule: string, cause: "content" | "newer-format" = "content"): StoreRefusal {
  return {
    code: "record-malformed", class: "recoverable", reference, rule, condition: rule,
    remedy: { text: cause === "newer-format" ? "Return to the merge base or rebuild with support for this format version." : "Repair the content to satisfy the named validation rule, then retry the write." },
  };
}

/** Inspect namespace, identity and planted key faults at a public read/write boundary.
 * @param state - Shared namespace with any injected storage faults.
 * @param reference - Target record.
 * @param identity - Configured person, if any.
 * @returns A refusal only when a genuine state condition prevents the operation.
 */
export function recordAdmission(state: MemoryState, reference: RecordReference, identity: string | undefined): StoreRefusal | undefined {
  const namespace = namespaceAdmission(state);
  if (namespace) return namespace;
  if (reference.owner.type === "person" && identity === undefined) return missingRecord(reference, identity);
  if (machineLocalPersonalPath(reference)) return {
    ...malformed(reference, "This personal path names excluded machine-local state."),
    remedy: { text: "Choose a stored personal path outside the machine-local directories, then retry with that reference." },
  };
  const fault = state.faults.get(recordKey(canonicalReference(state, reference)));
  if (fault?.kind === "identity-mismatch") return {
    code: "identity-mismatch", class: "recoverable", expected: reference, actual: fault.actual!,
    condition: "The stored record identity disagrees with the requested reference.",
    remedy: { text: "Restore the record under its actual identity, then retry using the corrected reference." },
  };
  return undefined;
}

function machineLocalPersonalPath(reference: RecordReference): boolean {
  if (reference.kind !== "personal/document" || typeof reference.key !== "string") return false;
  const segments = reference.key.split("/");
  return MACHINE_LOCAL_PATHS.some((path) => path.root === "user"
    && path.pattern.split("/").slice(1, -1).every((segment, index) =>
      segment === "*" ? segments[index] !== undefined : segments[index] === segment));
}

/** Refuse operations whose shared record index cannot be trusted.
 * @param state - Durable namespace with its injected structural fault.
 * @returns The terminal refusal and its index-rebuild remedy, or absence on a sound namespace.
 */
export function namespaceAdmission(state: MemoryState): StoreRefusal | undefined {
  return state.corrupt ? {
    code: "namespace-corrupt", class: "terminal", namespace: "memory",
    condition: "The namespace's record index is structurally corrupt.", remedy: { text: "Rebuild the namespace index from a saved state." },
  } : undefined;
}

/** Identify the injected surface lock for one owner's writes.
 * @param reference - Record on the locked surface.
 * @returns Its machine-local write lock name.
 */
export function surfaceLock(reference: RecordReference): string { return `memory:${ownerNameKey(reference.owner)}`; }
