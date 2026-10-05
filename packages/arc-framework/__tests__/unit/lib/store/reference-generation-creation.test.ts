/** Ordinary name-based creation allocates a new generation after completion. */
import { describe, expect, it } from "vitest";
import { BatchInputSchema, RecordReferenceSchema, WriteInputSchema } from "../../../../src/lib/store/index.js";
import { ArchiveQuarterSchema } from "../../../../src/lib/kernel/index.js";
import { createReferenceFixture } from "../../../helpers/store/reference-fixture.js";
import { seed, success, testProvenance, update } from "../../../helpers/store/suite-tools.js";

describe("reference completed-name reuse", () => {
  for (const previousKind of ["work-item/meta", "work-item/record"] as const) for (const kind of ["work-item/meta", "work-item/record"] as const) {
    it.each(["single", "primary-first", "companion-first"] as const)(`reuses a completed ${previousKind} name with a fresh ${kind} UID through ordinary references, %s`, async (mode) => {
      const fixture = createReferenceFixture();
      const remote = fixture.remote(true)!;
      const named = fixture.reference(kind);
      const first = await seed(fixture, fixture.reference(previousKind));
      const companionKind = kind === "work-item/meta" ? "work-item/notes" : "work-item/description";
      const companionName = fixture.reference(companionKind);
      const oldCompanion = await seed(fixture, RecordReferenceSchema.parse({ ...fixture.reference(previousKind === "work-item/meta" ? "work-item/notes" : "work-item/description"), owner: first.reference.owner }));
      success(await fixture.store.sync());
      success(await fixture.store.write(WriteInputSchema.parse({ ...update(fixture, first), placement: { kind: "completed", quarter: ArchiveQuarterSchema.parse("2026-q4") } })));
      success(await fixture.store.sync());
      const completed = success(await fixture.store.read({ reference: first.reference }));
      const archivedCompanion = success(await fixture.store.read({ reference: oldCompanion.reference }));
      const history = success(await fixture.store.history({ reference: first.reference }));
      const before = await fixture.settle(), remoteBefore = success(await remote.version());
      const createdContent = fixture.content(named, "changed-again");
      const creation = WriteInputSchema.parse({ action: "put", reference: named, expected: null, content: createdContent, placement: { kind: "active" }, provenance: testProvenance });
      const companionCreation = { action: "put" as const, reference: companionName, expected: null, content: fixture.content(companionName, "changed") };
      const { provenance, ...primary } = creation;
      const writes = mode === "companion-first" ? [companionCreation, primary] : [primary, companionCreation];
      if (mode === "single") {
        success(await fixture.store.write(creation));
        success(await fixture.store.write(WriteInputSchema.parse({ ...companionCreation, provenance })));
      } else {
        const unrelated = await seed(fixture, fixture.reference("project-registry/counter"));
        success(await fixture.store.write(WriteInputSchema.parse(update(fixture, unrelated))));
        const { provenance: staleProvenance, ...stale } = update(fixture, unrelated);
        void staleProvenance;
        const untouched = await fixture.settle();
        expect(await fixture.store.batch(BatchInputSchema.parse({ writes: [...writes, stale], provenance }))).toMatchObject({ status: "refused", refusal: { code: "version-conflict", records: [unrelated.reference] } });
        expect(await fixture.settle()).toBe(untouched);
        expect(success(await fixture.store.read({ reference: first.reference }))).toEqual(completed);
        expect(success(await fixture.store.read({ reference: oldCompanion.reference }))).toEqual(archivedCompanion);
        success(await fixture.store.batch(BatchInputSchema.parse({ writes, provenance })));
      }
      const created = success(await fixture.store.read({ reference: named }));
      expect(created.reference.owner).toMatchObject({ name: named.owner.name, uid: expect.stringMatching(/^[0-9a-f-]{36}$/u) });
      expect(created.reference.owner).not.toEqual(first.reference.owner);
      expect(created.placement).toEqual({ kind: "active" });
      expect(created.content).toBe(createdContent);
      const newCompanion = success(await fixture.store.read({ reference: companionName }));
      expect(newCompanion.reference.owner).toEqual(created.reference.owner);
      expect(newCompanion.content).toBe(companionCreation.content);
      expect(newCompanion.placement).toEqual({ kind: "active" });
      expect(success(await fixture.store.lookup({ kind: "slug", slug: named.owner.name }))).toEqual({ reference: created.reference });
      expect(success(await fixture.reopen().read({ reference: named }))).toEqual(created);
      expect(success(await fixture.store.read({ reference: first.reference }))).toEqual(completed);
      expect(success(await fixture.store.history({ reference: first.reference }))).toEqual(history);
      expect(success(await fixture.store.read({ reference: oldCompanion.reference }))).toEqual(archivedCompanion);
      expect(success(await fixture.store.read({ reference: first.reference, asOf: before }))).toEqual(completed);
      expect(await fixture.store.write(creation)).toMatchObject({ status: "refused", refusal: { code: "version-conflict" } });
      success(await fixture.store.sync());
      expect(success(await remote.read({ reference: named }))).toEqual(created);
      expect(success(await remote.lookup({ kind: "slug", slug: named.owner.name }))).toEqual({ reference: created.reference });
      expect(success(await remote.read({ reference: first.reference }))).toEqual(completed);
      expect(success(await remote.read({ reference: first.reference, asOf: remoteBefore }))).toEqual(completed);
      expect(success(await remote.read({ reference: companionName }))).toEqual(newCompanion);
      expect(success(await remote.read({ reference: oldCompanion.reference }))).toEqual(archivedCompanion);
    });
  }
});
