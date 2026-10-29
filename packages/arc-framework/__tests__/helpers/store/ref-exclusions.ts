/** Permanent applicability and remaining synchronization exclusions for ref conformance. */
import { KIND_REGISTRY, type FamilyId } from "../../../src/lib/store/index.js";
import type { FixtureDeclarations } from "./fixture-contract.js";

/** Ref mutations are local and support observations, history, placement, links, and UID rename. */
export const refRefusalExclusions: FixtureDeclarations["refusalExclusions"] = {
  "checkout-not-writable": "Ref writes do not require authority to edit the tracked checkout.",
  "unsupported:cross-substrate-batch": "Every ref batch publishes through one local ref transaction.",
  "unsupported:uncovered-state-version": "Ref manifests cover every served family.",
  "unsupported:work-item-kind-required": "Ref listings enumerate every registered kind in the family.",
  "unsupported:batch-observations": "Ref batches validate read observations atomically with their writes.",
  "unsupported:personal-history": "Ref storage records personal history.",
  "unsupported:links-write": "Ref storage writes work-item links.",
  "unsupported:placement-move": "Ref storage archives and reopens owners through placement writes.",
  "unsupported:completed-create": "Ref storage can create an owner in completed placement.",
  "unsupported:rename": "Ref storage mints UIDs and renames their owners.",
  "transient-write:unreachable": "Ref mutations are local; synchronization owns transport failures.",
  "transient-write:refused": "Ref mutations do not publish to a remote.",
  "transient-write:retries-exhausted": "Ref mutations do not run a remote publication retry loop.",
  "transient-write:version-conflict": "Ref mutations do not reconcile a transient identity ref during publication.",
  "transient-write:record-malformed": "Ref mutations validate named records before publication; synchronization owns reconciliation.",
};

export function refFamilyExclusions(families: readonly FamilyId[]): FixtureDeclarations["familyExclusions"] {
  const items = { 5: "Every state ref is published in one Git transaction.", 8: "Ref state versions cover every served family." };
  const exclusions: FixtureDeclarations["familyExclusions"] = Object.fromEntries(families.map((family) => [family, { items, assertions: {} }]));
  const add = (family: FamilyId, name: string, reason: string): void => {
    const target = exclusions[family];
    if (target) (target.assertions ??= {})[name] = reason;
  };
  for (const kind of ["project-inbox/inbox", "project-inbox/routing-receipt", "project-registry/identity",
    "project-registry/counter", "lineage/transition", "lineage/conflict-record"] as const) {
    add(KIND_REGISTRY[kind].family, `diagnostic-key-mismatch:${kind}`, "The fixed-ref generic fixture has no admitted second owner coordinate for this kind.");
  }
  return exclusions;
}
