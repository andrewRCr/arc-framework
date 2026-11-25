/** Complete container selection notices a newly qualifying nested owner while ignoring unused owners. */
import { expect, it } from "vitest";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { createReferenceFixture } from "../helpers/store/reference-fixture.js";
import { createRefFixture } from "../helpers/store/ref-fixture.js";
import { createWriteBackFixture } from "../helpers/store/projection/write-back-fixture.js";
import { success, seed } from "../helpers/store/suite-tools.js";
import { makeMetaFixture } from "../helpers/meta-fixture.js";
import { cohortDoc } from "../helpers/store/cohort-rule-input.js";
import { createKindRegistry } from "../../src/lib/store/registry.js";
import { PRODUCTION_REGISTRATIONS } from "../../src/lib/store/kinds/registrations.js";
import { ENTRY_CONFIGS } from "../../src/lib/store/kinds/entry-configs.js";
import { OwnerIdentitySchema, recordReferences } from "../../src/lib/store/identity.js";
import { prepareAdoptedProjectionSubmission } from "../../src/lib/store/projection/submission.js";
import { seedProjection } from "../helpers/store/projection/seeded-projection.js";
import { ArchiveQuarterSchema, SlugSchema } from "../../src/lib/kernel/index.js";

const registry = createKindRegistry(PRODUCTION_REGISTRATIONS);
for (const backend of ["reference", "default", "separate"] as const) for (const related of [true, false]) {
  it(`repeats complete established-container selection: ${backend}/${related}`, async () => {
    const f = backend === "reference" ? createReferenceFixture(ENTRY_CONFIGS, registry) : await createRefFixture(registry, backend);
    const h = await createWriteBackFixture({ fixture: f });
    try {
      const outer = f.reference("work-item/meta", "outer"), inner = f.reference("work-item/meta", "inner");
      const primary = await seed(f, outer, makeMetaFixture(outer.owner.name, { owner: "test-user", state: "Shipped",
        workClass: "Light", priority: "P1", currentWorkflow: null }),
      { kind: "completed", quarter: ArchiveQuarterSchema.parse("2026-q4") });
      await seed(f, recordReferences["cohort/document"](OwnerIdentitySchema.parse({ type: "cohort", name: outer.owner.name })),
        cohortDoc("parent").content.replaceAll("parent", outer.owner.name));
      const projected = await seedProjection({ store: f.store, checkout: h.checkout, identity: SlugSchema.parse("test-user"),
        files: [{ reference: primary.reference, path: `.arc/backlog/planned/${outer.owner.name}/meta-${outer.owner.name}.md` }] });
      const path = `.arc/backlog/planned/${outer.owner.name}/${inner.owner.name}/notes-${inner.owner.name}.md`;
      const content = "Authored nested companion.\n";
      await mkdir(dirname(join(h.checkout, path)), { recursive: true });
      await writeFile(join(h.checkout, path), content);
      const prepare = () => prepareAdoptedProjectionSubmission(h.context, h.checkout, path,
        { content, stamp: null, mtimeNs: "0" }, projected.index);
      const prepared = success(await prepare());
      expect(prepared.plan.prepared.reference).toMatchObject({ kind: "work-item/companion",
        owner: primary.reference.owner, key: `${inner.owner.name}/notes-${inner.owner.name}.md` });
      const incoming = related ? inner : f.reference("work-item/meta", "unused");
      const competing = await seed(f, incoming, makeMetaFixture(incoming.owner.name, { owner: "test-user", state: "Planning",
        workClass: "Light", priority: "P1", currentWorkflow: "process-task-loop", cohort: outer.owner.name }),
      { kind: "backlog", commitment: "planned" });
      expect(success(await f.store.read({ reference: primary.reference }))).toEqual(primary);
      const before = success(await f.store.version());
      const result = await f.store.batch(prepared.batch);
      if (related) {
        expect(result).toMatchObject({ status: "refused", refusal: { code: "version-conflict", cause: "projection-admission" } });
        expect(success(await f.store.version())).toBe(before);
        expect(await f.store.read({ reference: prepared.plan.prepared.reference }))
          .toMatchObject({ status: "refused", refusal: { code: "not-found" } });
        success(await f.store.write({ action: "remove", reference: competing.reference, expected: competing.version,
          provenance: { verb: "abandon", lifecycleAction: "remove" } }));
        success(await f.store.batch(success(await prepare()).batch));
      } else expect(result.status).toBe("ok");
      expect(success(await f.store.read({ reference: prepared.plan.prepared.reference })).content).toBe(content);
      expect(await readFile(join(h.checkout, path), "utf8")).toBe(content);
    } finally { await h.dispose(); }
  });
}
