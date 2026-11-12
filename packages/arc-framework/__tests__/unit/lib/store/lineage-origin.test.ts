/** Lineage origins resolve through either backend's existing identity representation. */
import { describe, expect, it } from "vitest";
import { LookupInputSchema, singletonReference } from "../../../../src/lib/store/index.js";
import { createReferenceFixture } from "../../../helpers/store/reference-fixture.js";
import { seed, success } from "../../../helpers/store/suite-tools.js";

describe("lineage origin identity", () => {
  it("accepts an origin's slug without requiring a persisted UID", () => {
    expect(LookupInputSchema.safeParse({ kind: "lineage", origin: "retired-origin" }).success).toBe(true);
  });
  it("resolves the same terminal origin by its name and minted UID", async () => {
    const fixture = createReferenceFixture();
    const work = await seed(fixture, fixture.reference("work-item/meta"));
    const transition = await seed(fixture, singletonReference(work.reference.owner, "lineage/transition"));
    expect(success(await fixture.store.lookup({ kind: "lineage", origin: work.reference.owner.name })).reference).toEqual(transition.reference);
    if (work.reference.owner.type === "person" || work.reference.owner.uid === undefined) throw new Error("Fixture must mint an origin UID");
    expect(success(await fixture.store.lookup({ kind: "lineage", origin: work.reference.owner.uid })).reference).toEqual(transition.reference);
  });
});
