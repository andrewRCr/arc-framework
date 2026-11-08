/** Atomic preparation replay preserves authored content when ownership changes before publication. */
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { expect, it } from "vitest";
import { createAdoptionFixture } from "../helpers/store/projection/adoption-fixture.js";
import { overrideEngineStore } from "../helpers/store/projection/engine-fixture.js";
import { seed, success, update } from "../helpers/store/suite-tools.js";
import { startProjection } from "../../src/lib/store/projection/engine.js";
import { writeMetaOwner } from "../../src/lib/store/kinds/meta/writers.js";
import { RecordReferenceSchema } from "../../src/lib/store/identity.js";
import { SlugSchema } from "../../src/lib/kernel/index.js";
import type { StoreRefusal } from "../../src/lib/store/refusal.js";

for (const layout of ["default", "separate"] as const) for (const perturbation of ["owner", "unrelated"] as const) {
  it(`rechecks adoption rights without fencing unrelated writes: ${layout}/${perturbation}`, async () => {
    const { f, primary, folder } = await createAdoptionFixture({ placement: { kind: "active" }, ownLayout: "nested", layout });
    const path = `${folder}/research-alpha.md`, text = "Prepared companion content.\n";
    await writeFile(join(f.root, path), text);
    const unrelated = await seed(f, RecordReferenceSchema.parse({ kind: "personal/document",
      owner: { type: "person", name: "andrew" }, key: "control.md" }), "Unrelated base.\n");
    let intercepted = false, refusal: StoreRefusal | undefined;
    const wrapped = overrideEngineStore(f.store, { batch: async input => {
      const mutation = input.writes[0];
      if (!intercepted && input.projectionAdmission && mutation?.reference.kind === "work-item/companion"
        && mutation.reference.key === "research") {
        intercepted = true;
        if (perturbation === "owner") {
          const prior = success(await f.store.read({ reference: primary.reference }));
          success(await f.store.write({ ...update(f, prior, writeMetaOwner(prior.content, SlugSchema.parse("bob"))),
            provenance: { verb: "handover", lifecycleAction: "handover" } }));
        } else success(await f.store.write(update(f, unrelated, "Unrelated changed.\n")));
      }
      const outcome = await f.store.batch(input);
      if (outcome.status === "refused") refusal = outcome.refusal;
      return outcome;
    } });
    await startProjection({ store: wrapped, checkout: f.root });
    expect(intercepted).toBe(true);
    const reference = RecordReferenceSchema.parse({ kind: "work-item/companion", owner: primary.reference.owner, key: "research" });
    if (perturbation === "owner") {
      expect(refusal).toMatchObject({ code: "version-conflict", cause: "projection-admission" });
      expect(await f.store.read({ reference })).toMatchObject({ status: "refused", refusal: { code: "not-found" } });
      expect(await readFile(join(f.root, path), "utf8")).toBe(text);
      await startProjection({ store: f.store, checkout: f.root });
      expect(await f.store.read({ reference })).toMatchObject({ status: "refused", refusal: { code: "not-found" } });
      const prior = success(await f.store.read({ reference: primary.reference }));
      success(await f.store.write({ ...update(f, prior, writeMetaOwner(prior.content, SlugSchema.parse("andrew"))),
        provenance: { verb: "handover", lifecycleAction: "handover" } }));
      await startProjection({ store: f.store, checkout: f.root });
    } else expect(refusal).toBeUndefined();
    expect(success(await f.store.read({ reference })).content).toBe(text);
  });
}
