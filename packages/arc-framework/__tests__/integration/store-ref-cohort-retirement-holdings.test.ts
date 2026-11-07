/** Retirement observes former-name holdings before a cohort leaves the live view. */
import { describe, expect, it } from "vitest";
import { createKindRegistry, RecordReferenceSchema } from "../../src/lib/store/index.js";
import { PRODUCTION_REGISTRATIONS } from "../../src/lib/store/kinds/registrations.js";
import { ArchiveQuarterSchema } from "../../src/lib/kernel/index.js";
import { observeOpenHoldings, cohortHoldingRepairs } from "../../src/lib/store/kinds/cohort/check-support.js";
import { writeCohortParent } from "../../src/lib/store/kinds/cohort/index.js";
import { writeMetaCohort } from "../../src/lib/store/kinds/meta/writers.js";
import { makeMetaFixture } from "../helpers/meta-fixture.js";
import { createReferenceFixture } from "../helpers/store/reference-fixture.js";
import { createRefFixture } from "../helpers/store/ref-fixture.js";
import { plantRefPrimary } from "../helpers/store/ref-primary-plant.js";
import { seed, success, update, mutationOf, testProvenance } from "../helpers/store/suite-tools.js";

const production = createKindRegistry(PRODUCTION_REGISTRATIONS);
const overrides = { "work-item/meta": production["work-item/meta"], "cohort/document": production["cohort/document"] };
const quarter = ArchiveQuarterSchema.parse("2026-q4");
const content = (name: string) => `# Cohort: \`${name}\`\n\n**Parent:** [none]\n\n**Purpose:** Coordinate work.\n`;

describe.each(["reference", "ref"] as const)("cohort retirement holdings over %s", backend => {
  const fixture = () => backend === "ref" ? createRefFixture(overrides) : Promise.resolve(createReferenceFixture({}, overrides));

  it("refuses a former-name holder, then closes when that member completes in the same batch", async () => {
    const f = await fixture(), initial = f.reference("cohort/document", "group");
    const cohort = await seed(f, initial, content(initial.owner.name));
    const memberRef = f.reference("work-item/meta", "held");
    const held = await seed(f, memberRef, makeMetaFixture(memberRef.owner.name, { cohort: initial.owner.name }));
    const renamed = RecordReferenceSchema.parse({ ...cohort.reference, owner: { ...cohort.reference.owner, name: "renamed" } });
    success(await f.store.write({ ...update(f, cohort, content("renamed")), reference: renamed }));
    const current = success(await f.store.read({ reference: renamed }));
    const write = { ...update(f, current, current.content), placement: { kind: "completed" as const, quarter } };
    const refused = await f.store.write(write);
    expect(refused).toMatchObject({ status: "refused", refusal: { rule: "cohort.open-members",
      condition: expect.stringContaining(memberRef.owner.name) } });
    if (refused.status !== "refused") throw new Error("Expected holding refusal");
    const uid = "uid" in held.reference.owner ? held.reference.owner.uid : undefined;
    if (uid === undefined) throw new Error("Expected the member's UID");
    expect(refused.refusal.condition).toContain(uid);
    expect(refused.refusal.condition).toContain(initial.owner.name);
    expect(refused.refusal.condition).toContain("renamed");
    expect(success(await f.store.read({ reference: renamed })).placement?.kind).not.toBe("completed");
    success(await f.store.batch({ writes: [mutationOf(write), mutationOf({ ...update(f, held, held.content),
      placement: { kind: "completed", quarter } })], provenance: testProvenance }));
    expect(success(await f.store.read({ reference: renamed })).placement?.kind).toBe("completed");
  });

  it("admits archive leaving a cohort open while a former-name record still holds it", async () => {
    const f = await fixture(), initial = f.reference("cohort/document", "group");
    const cohort = await seed(f, initial, content(initial.owner.name));
    const oldRef = f.reference("work-item/meta", "old");
    await seed(f, oldRef, makeMetaFixture(oldRef.owner.name, { cohort: initial.owner.name }));
    const renamed = RecordReferenceSchema.parse({ ...cohort.reference, owner: { ...cohort.reference.owner, name: "renamed" } });
    success(await f.store.write({ ...update(f, cohort, content("renamed")), reference: renamed }));
    const memberRef = f.reference("work-item/meta", "current");
    const current = await seed(f, memberRef, makeMetaFixture(memberRef.owner.name, { cohort: "renamed" }));
    const saved = success(await f.store.read({ reference: renamed }));
    success(await f.store.batch({ writes: [mutationOf(update(f, saved, saved.content)),
      mutationOf({ ...update(f, current, current.content), placement: { kind: "completed", quarter } })],
    provenance: { ...testProvenance, verb: "archive" } }));
    expect(success(await f.store.read({ reference: renamed })).placement?.kind).not.toBe("completed");
    expect(success(await f.store.read({ reference: memberRef })).placement?.kind).toBe("completed");
  });
});

it("counts ambiguous former holders for their owners while an unrelated cohort still retires", async () => {
  const f = await createRefFixture(overrides);
  const first = await plantRefPrimary(f, { kind: "cohort/document", name: "shared", uid: "00000000-0000-4000-8000-000000000001", content: content("shared") });
  const second = await plantRefPrimary(f, { kind: "cohort/document", name: "shared", uid: "00000000-0000-4000-8000-000000000002", content: content("shared") });
  const targets = [];
  for (const [index, reference] of [first, second].entries()) {
    const current = success(await f.store.read({ reference })), name = `renamed-${index}`;
    const renamed = RecordReferenceSchema.parse({ ...reference, owner: { ...reference.owner, name } });
    success(await f.store.write({ ...update(f, current, content(name)), reference: renamed }));
    targets.push(success(await f.store.read({ reference: renamed })));
  }
  await plantRefPrimary(f, { kind: "work-item/meta", name: "held", uid: "00000000-0000-4000-8000-000000000003",
    content: makeMetaFixture("held", { cohort: "shared" }) });
  for (const target of targets) expect(await f.store.write({ ...update(f, target, target.content), placement: { kind: "completed", quarter } }))
    .toMatchObject({ status: "refused", refusal: { rule: "cohort.open-members", condition: expect.stringContaining("held") } });
  const unrelated = await seed(f, f.reference("cohort/document", "unrelated"), content("unrelated"));
  success(await f.store.write({ ...update(f, unrelated, unrelated.content), placement: { kind: "completed", quarter } }));
  expect(success(await f.store.read({ reference: unrelated.reference })).placement?.kind).toBe("completed");
});

it("keeps closed-child Parent facts when only open records are counted for retirement", async () => {
  const f = await createRefFixture(overrides), parentRef = f.reference("cohort/document", "parent"), childRef = f.reference("cohort/document", "child");
  const parent = await seed(f, parentRef, content(parentRef.owner.name));
  const childContent = content(childRef.owner.name).replace("**Parent:** [none]", `**Parent:** \`${parentRef.owner.name}\``);
  const child = await seed(f, childRef, childContent);
  success(await f.store.write({ ...update(f, child, child.content), placement: { kind: "completed", quarter } }));
  const renamed = RecordReferenceSchema.parse({ ...parent.reference, owner: { ...parent.reference.owner, name: "renamed" } });
  success(await f.store.write({ ...update(f, parent, content("renamed")), reference: renamed }));
  const oldPath = `${parentRef.owner.name}/${childRef.owner.name}`;
  const member = await plantRefPrimary(f, { kind: "work-item/meta", name: "straggler", uid: "00000000-0000-4000-8000-000000000009",
    content: makeMetaFixture("straggler", { cohort: oldPath }) });
  const holdings = await observeOpenHoldings(f.store, f.store, renamed);
  if (holdings.status !== "known") throw new Error("Expected open holdings");
  expect(holdings.value.map(holding => holding.candidate.reference)).toEqual([member]);
  expect(cohortHoldingRepairs(holdings.value, "renamed"))
    .toMatchObject({ status: "unavailable", condition: expect.stringMatching(/closed|completed/iu) });

  const savedChild = success(await f.store.read({ reference: child.reference }));
  const nextChild = writeCohortParent(savedChild.content, "renamed");
  if (nextChild === null) throw new Error("Expected Parent field");
  const savedMember = success(await f.store.read({ reference: member })), nextPath = `renamed/${childRef.owner.name}`;
  success(await f.store.batch({ writes: [mutationOf(update(f, savedChild, nextChild)),
    mutationOf(update(f, savedMember, writeMetaCohort(savedMember.content, nextPath)))], provenance: testProvenance }));

  const late = await plantRefPrimary(f, { kind: "work-item/meta", name: "late", uid: "00000000-0000-4000-8000-000000000008",
    content: makeMetaFixture("late", { cohort: oldPath }) });
  const repaired = await observeOpenHoldings(f.store, f.store, renamed);
  if (repaired.status !== "known") throw new Error("Expected remaining open holdings");
  const edits = cohortHoldingRepairs(repaired.value, "renamed");
  expect(edits).toMatchObject({ status: "known", value: { edits: [{ record: { name: "late" }, from: oldPath, to: nextPath }] } });
  const saved = success(await f.store.read({ reference: late }));
  success(await f.store.write(update(f, saved, writeMetaCohort(saved.content, nextPath))));
});
