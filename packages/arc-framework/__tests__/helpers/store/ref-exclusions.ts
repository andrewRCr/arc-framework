/** Permanent applicability and remaining synchronization exclusions for ref conformance. */
import { KIND_REGISTRY, type FamilyId } from "../../../src/lib/store/index.js";
import type { FixtureDeclarations } from "./fixture-contract.js";

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
