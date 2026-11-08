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
import { createRefFixture } from "../helpers/store/ref-fixture.js";
import { createWriteBackFixture } from "../helpers/store/projection/write-back-fixture.js";
import { createKindRegistry } from "../../src/lib/store/registry.js";
import { PRODUCTION_REGISTRATIONS } from "../../src/lib/store/kinds/registrations.js";
import { ArchiveQuarterSchema } from "../../src/lib/kernel/index.js";
import { TransientIdentityRecordSchema } from "../../src/lib/errand/identity-record.js";
import { prepareAdoptedProjectionSubmission } from "../../src/lib/store/projection/submission.js";
import { resolveArcPath } from "../../src/lib/layout/index.js";
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

for (const layout of ["default", "separate"] as const) for (const qualifying of [true, false]) {
  it(`reselects after a candidate arrives during internal retry: ${layout}/${qualifying}`, async () => {
    const registry = createKindRegistry(PRODUCTION_REGISTRATIONS), f = await createRefFixture(registry, layout);
    const h = await createWriteBackFixture({ fixture: f });
    try {
      const placement = { kind: "completed", quarter: ArchiveQuarterSchema.parse("2026-q4") } as const;
      const archived = async (suffix: string) => {
        const reference = f.reference("work-item/record", suffix);
        const content = JSON.stringify(TransientIdentityRecordSchema.parse({ version: 3, kind: "errand", purpose: "errand",
          slug: reference.owner.name, claimId: "a".repeat(32), owner: "test-user", state: "open", branch: `chore/${reference.owner.name}`,
          createdAt: "2026-11-01T00:00:00Z", updatedAt: "2026-11-01T00:00:00Z", intent: "A bounded correction",
          origin: "description", originEntry: null, savedHead: null, changeRequest: null }));
        const created = success(await f.store.write({ action: "put", reference, expected: null, placement, content,
          provenance: { verb: "errand-open", lifecycleAction: "create" } }));
        return success(await f.store.read({ reference: created.reference }));
      };
      const primary = await archived("one");
      const git = (args: string[]) => f.ports.exec("git", [...f.gitDir ? [`--git-dir=${f.gitDir}`] : [], ...args], { cwd: f.root });
      const arrivalRef = expandStoredPath(primary.reference, { registry: f.ports.registry, placement: primary.placement }).ref;
      const originalArchive = (await git(["rev-parse", arrivalRef])).stdout.trim();
      const arriving = await archived(qualifying ? "one" : "unused");
      const arrivalHead = (await git(["rev-parse", arrivalRef])).stdout.trim();
      await git(["update-ref", arrivalRef, originalArchive, arrivalHead]);
      const control = await seed(f, f.reference("personal/working-memory"), "Control before retry.\n");
      const controlRef = expandStoredPath(control.reference, { registry: f.ports.registry }).ref;
      const originalControl = (await git(["rev-parse", controlRef])).stdout.trim();
      success(await f.store.write(update(f, control, "Control forcing retry.\n")));
      const changedControl = (await git(["rev-parse", controlRef])).stdout.trim();
      await git(["update-ref", controlRef, originalControl, changedControl]);
      const path = resolveArcPath({ kind: "errand-description", slug: primary.reference.owner.name, placement });
      const content = "## Description\n\n### [ ] **Retained concern**\n\nA correction.\n";
      const prepare = () => prepareAdoptedProjectionSubmission(h.context, h.checkout, path,
        { content, stamp: null, mtimeNs: "0" }, h.index);
      const prepared = success(await prepare());
      let attempts = 0;
      const retrying = createRefStore({ ...f.ports, lock: async (ref, wait) => {
        if (ref === "layout") {
          attempts++;
          if (attempts === 1) await git(["update-ref", controlRef, changedControl, originalControl]);
          if (attempts === 2) await git(["update-ref", arrivalRef, arrivalHead, originalArchive]);
        }
        return f.ports.lock(ref, wait);
      } });
      const result = await retrying.batch(prepared.batch), target = prepared.plan.prepared.reference;
      expect(attempts).toBeGreaterThanOrEqual(2);
      expect(success(await f.store.read({ reference: arriving.reference }))).toMatchObject({ version: arriving.version });
      if (qualifying) {
        expect(result).toMatchObject({ status: "refused", refusal: { code: "version-conflict", cause: "projection-admission" } });
        expect(await f.store.read({ reference: target })).toMatchObject({ status: "refused", refusal: { code: "not-found" } });
        success(await f.store.write({ action: "remove", reference: arriving.reference, expected: arriving.version,
          provenance: { verb: "abandon", lifecycleAction: "remove" } }));
        success(await f.store.batch(success(await prepare()).batch));
      } else expect(result.status).toBe("ok");
      expect(success(await f.store.read({ reference: target })).content).toContain("A correction.");
    } finally { await h.dispose(); }
  });
}
