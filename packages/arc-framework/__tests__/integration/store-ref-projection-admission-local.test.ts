/** A send recaptures local selectors instead of carrying a superseded checkout decision. */
import { expect, it } from "vitest";
import { createReferenceFixture } from "../helpers/store/reference-fixture.js";
import { createRefFixture } from "../helpers/store/ref-fixture.js";
import { createWriteBackFixture } from "../helpers/store/projection/write-back-fixture.js";
import { success, seed } from "../helpers/store/suite-tools.js";
import { createKindRegistry } from "../../src/lib/store/registry.js";
import { PRODUCTION_REGISTRATIONS } from "../../src/lib/store/kinds/registrations.js";
import { ENTRY_CONFIGS } from "../../src/lib/store/kinds/entry-configs.js";
import { createWriteBackPort } from "../../src/lib/store/projection/write-back.js";
import { captureProjectionLocal } from "../../src/lib/store/projection/local-capture.js";
import { writeProjectionIndex } from "../../src/lib/store/projection/index-file.js";
import { writeWorktreeMarker } from "../../src/lib/git/worktree-marker.js";
import { boundWorkUnitSubject } from "../helpers/store/bound-checkout.js";
import { SlugSchema } from "../../src/lib/kernel/index.js";
import { makeMetaFixture } from "../helpers/meta-fixture.js";

const registry = createKindRegistry(PRODUCTION_REGISTRATIONS);
for (const backend of ["reference", "default", "separate"] as const) for (const selector of ["marker", "identity", "binding"] as const) {
  it(`preserves an edit when local evidence changes during capture: ${backend}/${selector}`, async () => {
    const f = backend === "reference" ? createReferenceFixture(ENTRY_CONFIGS, registry) : await createRefFixture(registry, backend);
    const h = await createWriteBackFixture({ fixture: f, kind: selector === "marker" ? "work-item/meta" : "personal/document" });
    try {
      const reference = selector === "marker" ? f.reference("work-item/meta", "sibling") : f.reference("personal/document", "sibling");
      const sibling = await seed(f, reference, selector === "marker" ? makeMetaFixture(reference.owner.name, { owner: "test-user",
        state: "Active", workClass: "Light", priority: "P1", currentWorkflow: "process-task-loop" }) : "Sibling bytes.\n");
      const original = success(await f.store.read({ reference: h.entry.reference }));
      const text = original.content + "\nAuthored during local recapture.\n";
      await h.edit(text);
      const bytes = await h.file();
      let changed = false;
      const context = { ...h.context, captureLocal: async (path: string, source: "file" | "aside") => {
        const captured = await captureProjectionLocal({ checkout: h.checkout, path, source, location: h.location });
        if (!changed) {
          changed = true;
          if (selector === "marker") await writeWorktreeMarker(h.checkout, { spawnedByArc: false, spawningIdentity: "test-user",
            createdAt: "2026-11-01T00:00:00Z", createdFor: boundWorkUnitSubject(sibling) });
          else await writeProjectionIndex(h.location, selector === "identity"
            ? { ...h.index, projectedUnder: { ...h.index.projectedUnder, identity: SlugSchema.parse("another-user") } }
            : { ...h.index, entries: { ...h.index.entries, [h.path]: { ...h.entry, reference: sibling.reference } } });
        }
        return captured;
      } };
      const first = await createWriteBackPort(context)(h.request);
      expect(["pending", "refused"]).toContain(first.answer);
      expect(success(await f.store.read({ reference: h.entry.reference }))).toEqual(original);
      expect(success(await f.store.read({ reference: sibling.reference }))).toEqual(sibling);
      expect(first.entry.persisted).toBeNull();
      expect(await h.file()).toBe(bytes);
      await writeProjectionIndex(h.location, h.index);
      if (selector === "marker") await writeWorktreeMarker(h.checkout, { spawnedByArc: false, spawningIdentity: "test-user",
        createdAt: "2026-11-01T00:00:00Z", createdFor: boundWorkUnitSubject(original) });
      expect(await createWriteBackPort(h.context)({ ...h.request, entry: first.entry })).toMatchObject({ answer: "taken-in" });
      expect(success(await f.store.read({ reference: h.entry.reference })).content).toBe(text);
    } finally { await h.dispose(); }
  });
}
