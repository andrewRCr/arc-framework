/** Observable substrate hooks used by the repository conformance registration. */
import { describe, expect, it } from "vitest";
import { createInRepoFixture } from "../helpers/store/in-repo-fixture.js";
import { seed, success, update } from "../helpers/store/suite-tools.js";

describe("repository conformance fixture", () => {
  for (const kind of ["personal/document", "work-item/record", "claims/groom", "claims/housekeep"] as const) {
    it(`serves producer-valid ${kind} through a reopened public store`, async () => {
      const fixture = await createInRepoFixture();
      const record = await seed(fixture, fixture.reference(kind));
      expect(success(await fixture.reopen().read({ reference: record.reference }))).toEqual(record);
      if (kind.startsWith("claims/")) expect(record.reference.owner).toEqual({ type: "person", name: "andrew" });
    });
  }
  it("holds the actual personal notes lock and succeeds after release", async () => {
    const fixture = await createInRepoFixture();
    const record = await seed(fixture, fixture.reference("personal/document"));
    await fixture.hold(record.reference, true);
    expect(success(await fixture.store.read({ reference: record.reference }))).toEqual(record);
    expect(await fixture.store.write(update(fixture, record))).toMatchObject({ status: "refused", refusal: { code: "lock-held" } });
    await fixture.hold(record.reference, false);
    success(await fixture.store.write(update(fixture, record)));
    expect(success(await fixture.store.read({ reference: record.reference })).content).toBe(fixture.content(record.reference, "changed"));
  });
  it("races actual personal writes from one observed digest", async () => {
    const fixture = await createInRepoFixture();
    const record = await seed(fixture, fixture.reference("personal/document"));
    const results = await fixture.race(update(fixture, record), update(fixture, record, fixture.content(record.reference, "changed-again")));
    expect(results.filter((result) => result.status === "ok")).toHaveLength(1);
    expect(results.find((result) => result.status === "refused")).toMatchObject({ refusal: { code: "version-conflict", records: [record.reference] } });
  });
  for (const fault of ["malformed", "oversized", "unreadable", "key-mismatch", "family-unreadable", "unknown-format-version"] as const) {
    it(`plants a real transient ${fault} snapshot fault`, async () => {
      const fixture = await createInRepoFixture();
      const record = await seed(fixture, fixture.reference("work-item/record"));
      await fixture.plant(record.reference, fault);
      const listing = success(await fixture.store.list({ family: "work-item", kind: "work-item/record" }));
      if (fault === "family-unreadable") expect(listing).toMatchObject({ status: "unreadable" });
      else expect(listing).toMatchObject({ status: "complete", records: [], missed: true, diagnostics: [{ kind: fault === "unknown-format-version" ? "malformed" : fault }] });
      if (fault === "unknown-format-version") {
        expect(listing).toMatchObject({ diagnostics: [{ condition: "Unknown content version 9" }] });
        expect(success(await fixture.store.read({ reference: record.reference })).content).toBe('{"version":9}\n');
      }
      if (fault === "key-mismatch") expect(await fixture.store.read({ reference: record.reference })).toMatchObject({ status: "refused", refusal: { code: "identity-mismatch" } });
      if (fault === "unreadable" || fault === "family-unreadable") await expect(fixture.store.read({ reference: record.reference })).rejects.toMatchObject({ code: "store.operation-failed" });
    });
  }
});
