/** Cohort path writes admit current names and explain repairs of former segments. */
import { describe, expect, it } from "vitest";
import { createRefFixture } from "../helpers/store/ref-fixture.js";
import { createReferenceFixture } from "../helpers/store/reference-fixture.js";
import { seed, success, update } from "../helpers/store/suite-tools.js";
import { makeMetaFixture } from "../helpers/meta-fixture.js";
import { RecordReferenceSchema, createKindRegistry } from "../../src/lib/store/index.js";
import { PRODUCTION_REGISTRATIONS } from "../../src/lib/store/kinds/registrations.js";

const production = createKindRegistry(PRODUCTION_REGISTRATIONS);
const overrides = { "work-item/meta": production["work-item/meta"], "cohort/document": production["cohort/document"] };
const cohortContent = (name: string, parent: string | null = null) => `# Cohort: \`${name}\`\n\n${parent === null ? "" : `**Parent:** \`${parent}\`\n\n`}**Purpose:** Coordinate work.\n`;
const memberContent = (name: string, cohort: string | null = null) => makeMetaFixture(name,
  { cohort, owner: "test-user", workClass: "Light", currentWorkflow: "process-task-loop" });

describe.each(["reference", "ref"] as const)("current cohort segments over %s", backend => {
  const fixture = () => backend === "ref" ? createRefFixture(overrides) : Promise.resolve(createReferenceFixture({}, overrides));

  it.each(["single", "leaf", "parent"] as const)("refuses a former %s segment, then admits its current name", async segment => {
    const f = await fixture();
    const parentRef = f.reference("cohort/document", "parent"), childRef = f.reference("cohort/document", "child");
    const parent = await seed(f, parentRef, cohortContent(parentRef.owner.name));
    const child = segment === "single" ? undefined : await seed(f, childRef, cohortContent(childRef.owner.name, parent.reference.owner.name));
    const memberRef = f.reference("work-item/meta", "member");
    const member = await seed(f, memberRef, memberContent(memberRef.owner.name));
    const subject = segment === "leaf" && child !== undefined ? child : parent;
    const renamed = RecordReferenceSchema.parse({ ...subject.reference, owner: { ...subject.reference.owner, name: "renamed" } });
    success(await f.store.write({ ...update(f, subject, cohortContent("renamed", segment === "leaf" ? parent.reference.owner.name : null)), reference: renamed }));
    const oldPath = segment === "single" ? parent.reference.owner.name : `${parent.reference.owner.name}/${child?.reference.owner.name}`;
    expect(await f.store.write(update(f, member, memberContent(memberRef.owner.name, oldPath))))
      .toMatchObject({ status: "refused", refusal: { code: "record-malformed", rule: "meta.cohort", condition: expect.stringContaining("renamed") } });
    if (segment === "parent" && child !== undefined) success(await f.store.write(update(f, child, cohortContent(child.reference.owner.name, "renamed"))));
    const currentPath = segment === "single" ? "renamed" : segment === "leaf" ? `${parent.reference.owner.name}/renamed` : `renamed/${child?.reference.owner.name}`;
    success(await f.store.write(update(f, member, memberContent(memberRef.owner.name, currentPath))));
  });

  it("refuses a Parent's former name and admits its current one", async () => {
    const f = await fixture();
    const parentRef = f.reference("cohort/document", "parent"), childRef = f.reference("cohort/document", "child");
    const parent = await seed(f, parentRef, cohortContent(parentRef.owner.name));
    const child = await seed(f, childRef, cohortContent(childRef.owner.name));
    const renamed = RecordReferenceSchema.parse({ ...parent.reference, owner: { ...parent.reference.owner, name: "renamed" } });
    success(await f.store.write({ ...update(f, parent, cohortContent("renamed")), reference: renamed }));
    expect(await f.store.write(update(f, child, cohortContent(childRef.owner.name, parentRef.owner.name))))
      .toMatchObject({ status: "refused", refusal: { code: "record-malformed", rule: "cohort.parent", condition: expect.stringContaining("renamed") } });
    success(await f.store.write(update(f, child, cohortContent(childRef.owner.name, "renamed"))));
  });
});
