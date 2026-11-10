/** Prospective metadata validates creation parameters without minting a record. */
import { expect, it } from "vitest";
import { ArcLayoutAddressSchema } from "../../../../src/lib/layout/index.js";
import { inspectProspectiveStub } from "../../../../src/lib/store/projection/stub-adoption.js";
import { makeMetaFixture } from "../../../helpers/meta-fixture.js";

function backlogContainer(commitment: "provisional" | "planned") {
  const address = ArcLayoutAddressSchema.parse({ kind: "work-unit-container", slug: "demo",
    placement: { kind: "backlog", commitment, cohort: [] } });
  if (address.kind !== "work-unit-container") throw new Error("Expected container address");
  return address;
}

it.each(["Bogus", "light", "TBD"])("refuses explicit Class %s as the command does and accepts its repair", supplied => {
  const container = backlogContainer("provisional");
  const valid = makeMetaFixture("demo", { state: "Planning", owner: "andrew", workClass: "Light", priority: "P1" });
  const content = valid.replace("`Light`", `\`${supplied}\``);
  expect(inspectProspectiveStub(container, content, "andrew")).toMatchObject({ kind: "refused", mark: {
    reason: expect.stringContaining("Class"), remedy: { text: expect.stringContaining("parameters") },
  } });
  expect(inspectProspectiveStub(container, valid, "andrew")).toMatchObject({ kind: "stub", params: { cls: "Light", owner: "andrew" } });
});

it("refuses another owner's proposed stub and admits it after the ownership repair", () => {
  const container = backlogContainer("provisional");
  const foreign = makeMetaFixture("demo", { state: "Planning", owner: "bob", workClass: "Light", priority: "P1" });
  expect(inspectProspectiveStub(container, foreign, "andrew")).toMatchObject({ kind: "refused", mark: {
    reason: expect.stringContaining("Owner bob"), remedy: { text: expect.stringContaining("arc handover demo --to bob") },
  } });
  const repaired = makeMetaFixture("demo", { state: "Planning", owner: "andrew", workClass: "Light", priority: "P1" });
  expect(inspectProspectiveStub(container, repaired, "andrew")).toMatchObject({ kind: "stub", params: { owner: "andrew" } });
});

it("checks the command's priority schema before admitting a prospective stub", () => {
  const valid = makeMetaFixture("demo", { state: "Planning", owner: "andrew", workClass: "Light", priority: "P1" });
  const container = backlogContainer("provisional");
  expect(inspectProspectiveStub(container, valid.replace("`P1`", "`P0`"), "andrew")).toMatchObject({ kind: "refused",
    mark: { reason: expect.stringContaining("priority"), remedy: { text: expect.stringContaining("parameters") } } });
  expect(inspectProspectiveStub(container, valid, "andrew")).toMatchObject({ kind: "stub", params: { priority: "P1" } });
});

it("treats the rendered unresolved Class as omission, admitting provisional creation and requiring a planned Class", () => {
  const unresolved = makeMetaFixture("demo", { state: "Planning", owner: "andrew", workClass: "TBD", priority: "P1" });
  expect(unresolved).toContain("[TBD]");
  expect(inspectProspectiveStub(backlogContainer("provisional"), unresolved, "andrew")).toMatchObject({ kind: "stub", params: { cls: undefined } });
  expect(inspectProspectiveStub(backlogContainer("planned"), unresolved, "andrew")).toMatchObject({ kind: "refused", mark: {
    reason: expect.stringContaining("`stub --commitment planned` requires a resolved Class"),
  } });
  const repaired = makeMetaFixture("demo", { state: "Planning", owner: "andrew", workClass: "Light", priority: "P1" });
  expect(inspectProspectiveStub(backlogContainer("planned"), repaired, "andrew")).toMatchObject({ kind: "stub", params: { cls: "Light" } });
});

it("assigns an unowned prospective stub to the adopting identity", () => {
  const content = makeMetaFixture("demo", { state: "Planning", owner: "andrew", workClass: "Light", priority: "P1" })
    .replace("`andrew`", "[none]");
  expect(inspectProspectiveStub(backlogContainer("provisional"), content, "andrew")).toMatchObject({ kind: "stub", params: { owner: "andrew" } });
});
