/** Validate the one-manifest-per-ref constraint before consulting any store port. */

import { FAMILY_REGISTRY, type KindDefinition } from "../registry.js";
import type { KindId, OwnerType } from "../catalog.js";
import { rootFamily } from "./path-decode.js";

/** Reject anchor declarations whose records cannot own one unambiguous manifest. */
export function validateRefAnchors(registry: Readonly<Record<KindId, KindDefinition>>): void {
  const holders = new Map<string, KindId>();
  for (const kind of Object.values(registry)) {
    if (kind.anchorFields.length === 0) continue;
    const root = rootFamily(kind.family);
    const home = FAMILY_REGISTRY[root].ref;
    const owner: OwnerType = root === "work-item" || root === "cohort" ? root : root === "personal" || root === "claims" ? "person" : "project";
    if (kind.anchorFields.length !== 1 || kind.key !== null || kind.owner !== owner || !kind.ref || !home || !("pattern" in home)) {
      throw new Error(`Invalid anchor declaration for ${kind.id}: one field on a singleton on its owner's own ref is required`);
    }
    const prior = holders.get(home.pattern);
    if (prior) throw new Error(`Anchor declarations for ${prior} and ${kind.id} share one ref manifest path`);
    holders.set(home.pattern, kind.id);
  }
}
