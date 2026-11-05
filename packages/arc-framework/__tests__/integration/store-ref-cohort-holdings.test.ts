/** Current and former cohort names identify the same holdings over both storage backends. */
import { describe, expect, it } from "vitest";
import { createKindRegistry, RecordReferenceSchema } from "../../src/lib/store/index.js";
import { PRODUCTION_REGISTRATIONS } from "../../src/lib/store/kinds/registrations.js";
import { observeCohortHoldings, cohortHoldingEdits, type CohortHoldingCandidate } from "../../src/lib/store/kinds/cohort/check-support.js";
import { writeMetaCohort } from "../../src/lib/store/kinds/meta/writers.js";
import { writeCohortParent } from "../../src/lib/store/kinds/cohort/index.js";
import { ArchiveQuarterSchema } from "../../src/lib/kernel/index.js";
import { makeMetaFixture } from "../helpers/meta-fixture.js";
import { createReferenceFixture } from "../helpers/store/reference-fixture.js";
import { createRefFixture } from "../helpers/store/ref-fixture.js";
import { seed, success, update } from "../helpers/store/suite-tools.js";
import { plantRefPrimary } from "../helpers/store/ref-primary-plant.js";

const production = createKindRegistry(PRODUCTION_REGISTRATIONS);
const overrides = { "work-item/meta": production["work-item/meta"], "cohort/document": production["cohort/document"] };
const content = (name: string, parent: string | null = null) => `# Cohort: \`${name}\`\n\n**Parent:** ${parent === null ? "[none]" : `\`${parent}\``}\n\n**Purpose:** Coordinate work.\n`;

describe.each(["reference", "ref"] as const)("resolved cohort holdings over %s", backend => {
  const fixture = () => backend === "ref" ? createRefFixture(overrides) : Promise.resolve(createReferenceFixture({}, overrides));
  it("counts members on current and former names as sole holdings of the same owner", async () => {
    const f = await fixture(), reference = f.reference("cohort/document", "parent");
    const parent = await seed(f, reference, content(reference.owner.name));
    const oldMemberRef = f.reference("work-item/meta", "old-member");
    const oldMember = await seed(f, oldMemberRef, makeMetaFixture(oldMemberRef.owner.name, { cohort: reference.owner.name }));
    const renamed = RecordReferenceSchema.parse({ ...parent.reference, owner: { ...parent.reference.owner, name: "renamed" } });
    success(await f.store.write({ ...update(f, parent, content("renamed")), reference: renamed }));
    const currentMemberRef = f.reference("work-item/meta", "current-member");
    const currentMember = await seed(f, currentMemberRef, makeMetaFixture(currentMemberRef.owner.name, { cohort: "renamed" }));
    const candidates: CohortHoldingCandidate[] = [
      { reference: oldMember.reference, field: "cohort", path: reference.owner.name, completed: false },
      { reference: currentMember.reference, field: "cohort", path: "renamed", completed: false },
    ];
    const holdings = await observeCohortHoldings(candidates, f.store, renamed);
    expect(holdings).toMatchObject({ status: "known", value: [
      { candidate: candidates[0], resolution: "sole", segment: 0, segments: [{ status: "known", currentSlug: "renamed", reference: renamed }] },
      { candidate: candidates[1], resolution: "sole", segment: 0, segments: [{ status: "known", currentSlug: "renamed", reference: renamed }] },
    ] });
    if (holdings.status !== "known") throw new Error("Expected cohort holdings");
    expect(cohortHoldingEdits(holdings.value, "renamed")).toMatchObject({ status: "known", value: [
      { record: { type: "work-unit", name: oldMember.reference.owner.name, uid: expect.any(String) }, field: "cohort", from: reference.owner.name, to: "renamed" },
    ] });
  });

  it("re-points a former Parent and child path with open clears before Parent and completed rewrites afterward", async () => {
    const f = await fixture(), parentRef = f.reference("cohort/document", "parent"), childRef = f.reference("cohort/document", "child");
    const parent = await seed(f, parentRef, content(parentRef.owner.name));
    const child = await seed(f, childRef, content(childRef.owner.name, parentRef.owner.name));
    const oldPath = `${parentRef.owner.name}/${childRef.owner.name}`;
    const openRef = f.reference("work-item/meta", "open"), endedRef = f.reference("work-item/meta", "ended");
    const open = await seed(f, openRef, makeMetaFixture(openRef.owner.name, { cohort: oldPath }));
    const ended = await seed(f, endedRef, makeMetaFixture(endedRef.owner.name, { state: "Shipped", cohort: oldPath }),
      { kind: "completed", quarter: ArchiveQuarterSchema.parse("2026-q1") });
    const newParent = RecordReferenceSchema.parse({ ...parent.reference, owner: { ...parent.reference.owner, name: "parent-now" } });
    const newChild = RecordReferenceSchema.parse({ ...child.reference, owner: { ...child.reference.owner, name: "child-now" } });
    success(await f.store.write({ ...update(f, parent, content("parent-now")), reference: newParent }));
    success(await f.store.write({ ...update(f, child, content("child-now", parentRef.owner.name)), reference: newChild }));
    const holdings = await observeCohortHoldings([
      { reference: newChild, field: "parent", path: parentRef.owner.name, completed: false },
      { reference: open.reference, field: "cohort", path: oldPath, completed: false },
      { reference: ended.reference, field: "cohort", path: oldPath, completed: true },
    ], f.store, newParent);
    if (holdings.status !== "known") throw new Error("Expected cohort holdings");
    const edits = cohortHoldingEdits(holdings.value, "parent-now"), nextPath = "parent-now/child-now";
    expect(edits).toMatchObject({ status: "known", value: [
      { record: { name: open.reference.owner.name }, field: "cohort", from: oldPath, to: null },
      { record: { name: "child-now" }, field: "parent", from: parentRef.owner.name, to: "parent-now" },
      { record: { name: open.reference.owner.name }, field: "cohort", from: null, to: nextPath },
      { record: { name: ended.reference.owner.name }, field: "cohort", from: oldPath, to: nextPath },
    ] });
    if (edits.status !== "known") throw new Error("Expected ordered edits");
    for (const edit of edits.value) {
      const reference = RecordReferenceSchema.parse({ kind: edit.record.type === "cohort" ? "cohort/document" : "work-item/meta",
        owner: { type: edit.record.type === "cohort" ? "cohort" : "work-item", name: edit.record.name, uid: edit.record.uid } });
      const saved = success(await f.store.read({ reference }));
      const next = edit.field === "cohort" ? writeMetaCohort(saved.content, edit.to)
        : edit.to === null ? null : writeCohortParent(saved.content, edit.to);
      if (next === null) throw new Error("Expected an authored Parent field");
      success(await f.store.write(update(f, saved, next)));
    }
    expect(success(await f.store.read({ reference: open.reference })).content).toContain(nextPath);
    expect(success(await f.store.read({ reference: ended.reference })).content).toContain(nextPath);
  });
});

it("counts an ambiguous cohort segment for each of its actual owner candidates", async () => {
  const f = await createRefFixture(overrides);
  const first = await plantRefPrimary(f, { kind: "cohort/document", name: "shared", uid: "00000000-0000-4000-8000-000000000001", content: content("shared") });
  const second = await plantRefPrimary(f, { kind: "cohort/document", name: "shared", uid: "00000000-0000-4000-8000-000000000002", content: content("shared") });
  const member = await plantRefPrimary(f, { kind: "work-item/meta", name: "held", uid: "00000000-0000-4000-8000-000000000003", content: makeMetaFixture("held", { cohort: "shared" }) });
  for (const target of [first, second]) expect(await observeCohortHoldings([
    { reference: member, field: "cohort", path: "shared", completed: false },
  ], f.store, target)).toMatchObject({ status: "known", value: [{ resolution: "ambiguous",
    segments: [{ status: "ambiguous", candidates: expect.arrayContaining([first, second]) }] }] });
});

it("withholds a sequential Parent repair that would erase an open straggler's completed-child holding proof", async () => {
  const f = await createRefFixture(overrides), parentRef = f.reference("cohort/document", "parent"), childRef = f.reference("cohort/document", "child");
  const parent = await seed(f, parentRef, content(parentRef.owner.name));
  const child = await seed(f, childRef, content(childRef.owner.name, parentRef.owner.name));
  success(await f.store.write({ ...update(f, child, child.content), placement: { kind: "completed", quarter: ArchiveQuarterSchema.parse("2026-q1") } }));
  const oldPath = `${parentRef.owner.name}/${childRef.owner.name}`;
  const member = await plantRefPrimary(f, { kind: "work-item/meta", name: "straggler", uid: "00000000-0000-4000-8000-000000000009",
    content: makeMetaFixture("straggler", { cohort: oldPath }) });
  const renamed = RecordReferenceSchema.parse({ ...parent.reference, owner: { ...parent.reference.owner, name: "renamed" } });
  success(await f.store.write({ ...update(f, parent, content("renamed")), reference: renamed }));
  const holdings = await observeCohortHoldings([
    { reference: child.reference, field: "parent", path: parentRef.owner.name, completed: true },
    { reference: member, field: "cohort", path: oldPath, completed: false },
  ], f.store, renamed);
  if (holdings.status !== "known") throw new Error("Expected cohort holdings");
  const plan = cohortHoldingEdits(holdings.value, "renamed");
  let refusal: unknown;
  if (plan.status === "known") for (const edit of plan.value) {
    const reference = edit.record.type === "cohort" ? child.reference : member;
    const saved = success(await f.store.read({ reference }));
    const next = edit.field === "cohort" ? writeMetaCohort(saved.content, edit.to)
      : edit.to === null ? null : writeCohortParent(saved.content, edit.to);
    if (next === null) throw new Error("Expected Parent content");
    const result = await f.store.write(update(f, saved, next));
    if (result.status === "refused") { refusal = result.refusal; break; }
  }
  expect({ plan, refusal }).toMatchObject({ plan: { status: "unavailable" }, refusal: undefined });
  const straggler = success(await f.store.read({ reference: member }));
  success(await f.store.write(update(f, straggler, writeMetaCohort(straggler.content, null))));
  const repaired = await observeCohortHoldings([
    { reference: child.reference, field: "parent", path: parentRef.owner.name, completed: true },
  ], f.store, renamed);
  if (repaired.status !== "known") throw new Error("Expected remaining Parent holding");
  const nextPlan = cohortHoldingEdits(repaired.value, "renamed");
  expect(nextPlan).toMatchObject({ status: "known", value: [{ field: "parent", from: parentRef.owner.name, to: "renamed" }] });
  const closed = success(await f.store.read({ reference: child.reference }));
  const next = writeCohortParent(closed.content, "renamed");
  if (next === null) throw new Error("Expected Parent field");
  success(await f.store.write(update(f, closed, next)));
});
