/** An internal native publication retry keeps the original prepared decision attached. */
import { expect, it } from "vitest";
import { writeFile, readFile } from "node:fs/promises";
import { join } from "node:path";
import { createAdoptionFixture } from "../helpers/store/projection/adoption-fixture.js";
import { overrideEngineStore } from "../helpers/store/projection/engine-fixture.js";
import { seed, success, update } from "../helpers/store/suite-tools.js";
import { createRefStore } from "../../src/lib/store/create.js";
import { startProjection } from "../../src/lib/store/projection/engine.js";
import { writeMetaOwner } from "../../src/lib/store/kinds/meta/writers.js";
import { RecordReferenceSchema } from "../../src/lib/store/identity.js";
import { SlugSchema } from "../../src/lib/kernel/index.js";
import { expandStoredPath } from "../../src/lib/store/stored-path.js";

for (const layout of ["default", "separate"] as const) for (const changedOwner of [true, false]) {
  it(`replays after a changed captured ref instead of caching admission: ${layout}/${changedOwner}`, async () => {
    const { f, primary, folder } = await createAdoptionFixture({ placement: { kind: "active" }, ownLayout: "nested", layout });
    const git = (args: string[]) => f.ports.exec("git", [...f.gitDir ? [`--git-dir=${f.gitDir}`] : [], ...args], { cwd: f.root });
    const primaryRef = expandStoredPath(primary.reference, { registry: f.ports.registry }).ref;
    const originalPrimary = (await git(["rev-parse", primaryRef])).stdout.trim();
    success(await f.store.write({ ...update(f, primary, writeMetaOwner(primary.content, SlugSchema.parse("bob"))),
      provenance: { verb: "handover", lifecycleAction: "handover" } }));
    const changedPrimary = (await git(["rev-parse", primaryRef])).stdout.trim();
    await git(["update-ref", primaryRef, originalPrimary, changedPrimary]);
    const control = await seed(f, RecordReferenceSchema.parse({ kind: "personal/document", owner: { type: "person", name: "andrew" },
      key: "retry-control.md" }), "Control before retry.\n");
    const controlRef = expandStoredPath(control.reference, { registry: f.ports.registry }).ref;
    const originalControl = (await git(["rev-parse", controlRef])).stdout.trim();
    success(await f.store.write(update(f, control, "Control causing retry.\n")));
    const changedControl = (await git(["rev-parse", controlRef])).stdout.trim();
    await git(["update-ref", controlRef, originalControl, changedControl]);
    const path = `${folder}/research-alpha.md`, content = "Authored across native retries.\n";
    await writeFile(join(f.root, path), content);
    let armed = false, attempts = 0;
    const retrying = createRefStore({ ...f.ports, lock: async (ref, wait) => {
      if (armed && ref === "layout") {
        attempts++;
        if (attempts === 1) await git(["update-ref", controlRef, changedControl, originalControl]);
        if (attempts === 2 && changedOwner) await git(["update-ref", primaryRef, changedPrimary, originalPrimary]);
      }
      return f.ports.lock(ref, wait);
    } });
    const store = overrideEngineStore(f.store, { batch: async input => {
      if (!input.projectionAdmission) return f.store.batch(input);
      armed = true;
      try { return await retrying.batch(input); } finally { armed = false; }
    } });
    await startProjection({ store, checkout: f.root });
    expect(attempts).toBeGreaterThanOrEqual(2);
    expect(success(await f.store.read({ reference: control.reference })).content).toBe("Control causing retry.\n");
    const target = RecordReferenceSchema.parse({ kind: "work-item/companion", owner: primary.reference.owner, key: "research" });
    if (changedOwner) {
      expect(await f.store.read({ reference: target })).toMatchObject({ status: "refused", refusal: { code: "not-found" } });
      expect(await readFile(join(f.root, path), "utf8")).toBe(content);
      const current = success(await f.store.read({ reference: primary.reference }));
      success(await f.store.write({ ...update(f, current, primary.content), provenance: { verb: "handover", lifecycleAction: "handover" } }));
      await startProjection({ store: f.store, checkout: f.root });
    }
    expect(success(await f.store.read({ reference: target })).content).toBe(content);
  });
}
