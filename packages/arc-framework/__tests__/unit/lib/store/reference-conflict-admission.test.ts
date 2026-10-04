/** Conflict payload admission remains intrinsic when a registry has no optional parser. */
import { describe, expect, it } from "vitest";
import { BatchInputSchema, WriteInputSchema } from "../../../../src/lib/store/index.js";
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
