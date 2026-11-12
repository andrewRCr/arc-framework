/** Additive reports name landed records and leave all content distribution to authoring. */
import { expect, it } from "vitest";
import { createDecomposePlanFixture } from "../../../fixtures/decompose-plan.js";
import { lifecycleSuccess } from "../../../helpers/store/lifecycle-harness.js";
import { runStoreDecomposeAdditive } from "../../../../src/lib/decompose/additive.js";
import { DecomposeAdditiveReportSchema } from "../../../../src/lib/decompose/additive-report.js";
import { recordReferences } from "../../../../src/lib/store/identity.js";

it("reports every write and every destination allocation, including an existing home's", async () => {
  const h = await createDecomposePlanFixture();
  const home = await h.seedStub("home");
  h.map.authoring.shape = "heterogeneous";
  h.map.authoring.destinations.push({ kind: "existing-home", destinationId: "z-home", target: { kind: "work-unit", slug: "home" } });
  const allocation = h.map.authoring.sourceAllocations[0];
  if (allocation?.disposition.kind !== "target") throw new Error("Expected allocation.");
  allocation.disposition.destinationId = "z-home";
  allocation.disposition.targetLocator.artifact = "draft-home.md";
  const applied = await runStoreDecomposeAdditive(h.ctx, "origin", "execute", { cutMap: h.map, cutMapPath: "cut.json" });
  if (applied.status === "refused") throw new Error(JSON.stringify(applied));
  const report = applied.result.report;
  expect(DecomposeAdditiveReportSchema.safeParse(report).success).toBe(true);
  expect(report.records).toEqual(applied.result.batch.writes.map(write => write.reference));
  expect(report.members.map(member => ({ slug: member.slug, copies: member.copies.map(copy => copy.basename) }))).toEqual([
    { slug: "member-a", copies: ["draft-member-a.md"] }, { slug: "member-b", copies: ["draft-member-b.md"] },
  ]);
  for (const member of report.members) {
    expect(member.meta.owner).toMatchObject({ name: member.slug, uid: expect.any(String) });
    expect(report.records).toContainEqual(member.meta);
    for (const copy of member.copies) {
      expect(report.records).toContainEqual(copy.reference);
      expect(copy.reference.owner).toEqual(member.meta.owner);
    }
  }
  expect(report.cohorts).toMatchObject([{ path: "group", reference: { kind: "cohort/document" } }]);
  expect(report.storedMap).toMatchObject({ kind: "work-item/cut-map", owner: h.primary.reference.owner });
  for (const requirement of report.authoring) {
    const expected = h.map.authoring.sourceAllocations.filter(item => item.disposition.kind === "target"
      && item.disposition.destinationId === requirement.destination.destinationId);
    expect(requirement.allocations.map(item => item.sourceId)).toEqual(expected.map(item => item.sourceId));
    for (const item of requirement.allocations) {
      const authored = expected.find(candidate => candidate.sourceId === item.sourceId);
      const source = h.map.machine.sourceUnits.find(candidate => candidate.sourceId === item.sourceId);
      if (authored?.disposition.kind !== "target" || source === undefined) throw new Error("Expected bound source allocation.");
      expect(item).toEqual({ sourceId: authored.sourceId, sourceLocator: source.sourceLocator, ownership: authored.ownership,
        targetLocator: authored.disposition.targetLocator });
    }
  }
  expect(report.authoring.find(item => item.destination.destinationId === "z-home")?.allocations).toMatchObject([
    { sourceId: allocation.sourceId, targetLocator: allocation.disposition.targetLocator },
  ]);
  expect(lifecycleSuccess(await h.store.read({ reference: home.reference }))).toEqual(home);
  expect(await h.store.read({ reference: recordReferences["work-item/draft"](home.reference.owner) })).toMatchObject({ status: "refused", refusal: { code: "not-found" } });
  expect(report.nextStep).toMatchObject({ kind: "author-then-preview", argv: ["arc", "decompose", "origin", "--finish"] });
  expect(report.nextStep.text).toMatch(/author.*preview/iu);
});
