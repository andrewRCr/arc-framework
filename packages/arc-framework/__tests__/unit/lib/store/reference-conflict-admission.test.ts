/** Conflict payload admission remains intrinsic when a registry has no optional parser. */
import { describe, expect, it } from "vitest";
import { BatchInputSchema, RecordReferenceSchema, WriteInputSchema } from "../../../../src/lib/store/index.js";
import { createReferenceFixture } from "../../../helpers/store/reference-fixture.js";
import { seed, success, testProvenance, update } from "../../../helpers/store/suite-tools.js";

describe.each(["invalid JSON", "invalid shape"])("conflict payload: %s", (malformation) => {
  it.each([false, true])("refuses without changing state and accepts repaired content; batch: %s", async (batch) => {
    const kind = "project-registry/conflict-record";
    const fixture = createReferenceFixture({}, { [kind]: { parser: null } });
    const sibling = await seed(fixture, fixture.reference("project-registry/counter", "sibling"));
    const reference = fixture.reference(kind);
    const before = success(await fixture.store.version());
    const write = WriteInputSchema.parse({ action: "put", reference, expected: null,
      content: malformation === "invalid JSON" ? "{broken" : "{}", provenance: testProvenance });
    if (write.action !== "put") throw new Error("Conflict admission requires a put fixture");
    const perform = (content: string) => {
      const { provenance, ...mutation } = { ...write, content };
      const { provenance: siblingProvenance, ...siblingMutation } = update(fixture, sibling);
      void siblingProvenance;
      return batch ? fixture.store.batch(BatchInputSchema.parse({ writes: [siblingMutation, mutation], provenance }))
        : fixture.store.write({ ...mutation, provenance });
    };
    await expect(perform(write.content)).resolves.toMatchObject({ status: "refused", refusal: {
      code: "record-malformed", class: "recoverable", reference, rule: expect.any(String),
      remedy: { text: expect.any(String) },
    } });
    expect(success(await fixture.reopen().version())).toBe(before);
    expect(success(await fixture.reopen().read({ reference: sibling.reference }))).toEqual(sibling);
    expect(await fixture.store.read({ reference })).toMatchObject({ status: "refused", refusal: { code: "not-found" } });
    const repaired = fixture.content(reference);
    expect((await perform(repaired)).status).toBe("ok");
    expect(success(await fixture.reopen().read({ reference })).content).toBe(repaired);
    expect(success(await fixture.store.read({ reference: sibling.reference })).content)
      .toBe(batch ? fixture.content(sibling.reference, "changed") : sibling.content);
  });
});

describe.each(["identity", "lock"] as const)("implicit conflict removal admission: %s", (failure) => {
  it.each([false, true])("refuses the complete mutation until repaired; batch: %s", async (batch) => {
      const fixture = createReferenceFixture();
      const target = await seed(fixture, fixture.reference("project-registry/counter"));
      const sibling = await seed(fixture, fixture.reference("project-registry/counter", "sibling"));
      const conflict = await seed(fixture, fixture.reference("personal/conflict-record"));
      const before = success(await fixture.store.version());
      if (failure === "identity") fixture.identity(undefined);
      else await fixture.hold(conflict.reference, true);
      const expectedCode = failure === "identity" ? "not-found" : "lock-held";
      expect(await fixture.store.write({ action: "remove", reference: conflict.reference, expected: conflict.version,
        resolves: [conflict.reference], provenance: testProvenance })).toMatchObject({ status: "refused", refusal: { code: expectedCode } });
      const resolving = { ...update(fixture, target), resolves: [conflict.reference] };
      const perform = () => {
        const { provenance, ...mutation } = resolving;
        const { provenance: siblingProvenance, ...other } = update(fixture, sibling);
        void siblingProvenance;
        return batch ? fixture.store.batch({ writes: [other, mutation], provenance }) : fixture.store.write(resolving);
      };
      expect(await perform()).toMatchObject({ status: "refused", refusal: { code: expectedCode } });
      expect(success(await fixture.reopen().version())).toBe(before);
      expect(success(await fixture.store.read({ reference: target.reference }))).toEqual(target);
      expect(success(await fixture.store.read({ reference: sibling.reference }))).toEqual(sibling);
      fixture.identity("andrew");
      await fixture.hold(conflict.reference, false);
      expect(success(await fixture.reopen().read({ reference: conflict.reference }))).toEqual(conflict);
      expect((await perform()).status).toBe("ok");
      expect(await fixture.reopen().read({ reference: conflict.reference })).toMatchObject({ status: "refused", refusal: { code: "not-found" } });
      expect(success(await fixture.store.read({ reference: target.reference })).content).toBe(resolving.content);
      expect(success(await fixture.store.read({ reference: sibling.reference })).content).toBe(batch ? fixture.content(sibling.reference, "changed") : sibling.content);
  });
});

describe("implicit conflict removal aliases", () => {
  it.each(["name", "uid"] as const)("checks the live conflict surface through a former %s reference", async (handle) => {
    const fixture = createReferenceFixture();
    const primary = await seed(fixture, fixture.reference("work-item/meta"));
    const named = fixture.reference("work-item/conflict-record");
    const conflict = await seed(fixture, named);
    const renamed = RecordReferenceSchema.parse({ ...primary.reference, owner: { ...primary.reference.owner, name: "renamed" } });
    success(await fixture.store.write({ ...update(fixture, primary), reference: renamed }));
    const current = success(await fixture.store.read({ reference: conflict.reference }));
    expect(current.reference.owner.name).toBe("renamed");
    const target = await seed(fixture, fixture.reference("project-registry/counter"));
    const resolving = { ...update(fixture, target), resolves: [handle === "name" ? named : conflict.reference] };
    const before = success(await fixture.store.version());
    await fixture.hold(current.reference, true);
    expect(await fixture.store.write(resolving)).toMatchObject({ status: "refused", refusal: { code: "lock-held" } });
    expect(success(await fixture.store.version())).toBe(before);
    expect(success(await fixture.store.read({ reference: current.reference }))).toEqual(current);
    await fixture.hold(current.reference, false);
    success(await fixture.store.write(resolving));
    expect(await fixture.store.read({ reference: current.reference })).toMatchObject({ status: "refused", refusal: { code: "not-found" } });
  });
});
