/** Pure wrapper fixtures for codec and presence-only tests; no backend birth claim. */
import type { CutMap } from "../../src/lib/decompose/cut-map-schema.js";
import { deriveDecomposeBirthKey } from "../../src/lib/decompose/owner-birth-history.js";
import { OwnerIdentitySchema, recordReferences } from "../../src/lib/store/identity.js";
import { StoredCutMapSchema, type StoredCutMap, compareStoredCutOwnerBirths } from "../../src/lib/store/kinds/cut-map/schema.js";
import { SlugSchema } from "../../src/lib/kernel/index.js";

/** Wrap a static first-cut map using an empty prior history and new-cohort bindings. */
export function storedCutMapFixture(map: CutMap): StoredCutMap {
  const reference = recordReferences["work-item/cut-map"](OwnerIdentitySchema.parse({ type: "work-item", name: map.machine.origin.slug, uid: map.machine.origin.uid }));
  const placement = map.authoring.placement;
  const paths = placement.kind === "cohort" || placement.kind === "subcohort" ? placement.cohort.split("/") : [];
  const names = [...map.authoring.destinations.flatMap(destination => destination.kind === "new-member"
    ? [{ kind: "work-item/meta" as const, name: SlugSchema.parse(destination.slug) }] : []),
  ...paths.map(name => ({ kind: "cohort/document" as const, name: SlugSchema.parse(name) }))];
  return StoredCutMapSchema.parse({ schemaVersion: 1, map, ownerBirths: names.map(birth => {
    const key = deriveDecomposeBirthKey(reference, birth, []);
    if (key.status === "refused") throw new Error(JSON.stringify(key));
    return { ...birth, birthKey: key.result };
  }).sort(compareStoredCutOwnerBirths) });
}
