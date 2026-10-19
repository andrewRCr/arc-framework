/** Every layout artifact retains a registered storage role with the same artifact name. */
import { expect, it } from "vitest";
import { WorkUnitArtifactKindSchema, type WorkUnitArtifactKind } from "../../../src/lib/layout/index.js";
import { KIND_REGISTRY, KIND_MECHANISMS } from "../../../src/lib/store/registry.js";
import type { KindId } from "../../../src/lib/store/catalog.js";

const kinds: Record<WorkUnitArtifactKind, KindId> = {
  meta: "work-item/meta",
  draft: "work-item/draft",
  spec: "work-item/spec",
  tasks: "work-item/task-list",
  notes: "work-item/notes",
};

it("maps exactly the layout's declared work-unit artifacts", () => {
  expect(Object.keys(kinds).sort()).toEqual([...WorkUnitArtifactKindSchema.options].sort());
});
it.each(WorkUnitArtifactKindSchema.options)("registers %s with its matching layout role", artifact => {
  const kind = kinds[artifact];
  expect(KIND_REGISTRY[kind]).toMatchObject({ id: kind, family: "work-item" });
  expect(KIND_MECHANISMS[kind].projection).toEqual({ kind: "work-unit-artifact", artifact });
  expect(KIND_MECHANISMS[kind].inRepo.address).toEqual({ kind: "work-unit-artifact", artifact });
});
