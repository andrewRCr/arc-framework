/** A hand edit of a cohort record names under its members heading only the current names of that cohort's members. */
import { expect, it } from "vitest";
import { createLifecycleHarness, lifecycleSuccess } from "../../../../../helpers/store/lifecycle-harness.js";
import { fixtureRenameProvenance } from "../../../../../helpers/store/suite-tools.js";
import { conflictViewRecord } from "../../../../../helpers/store/view-conflicts.js";
import { OwnerIdentitySchema, recordReferences, RecordReferenceSchema, type RecordReference } from "../../../../../../src/lib/store/identity.js";
import { recordPut } from "../../../../../../src/lib/store/lifecycle-write.js";
import { observeRecords } from "../../../../../../src/lib/store/record-observations.js";
import { rewriteCohortHeading } from "../../../../../../src/lib/store/kinds/cohort/index.js";
import { writeMetaCohort, writeMetaTitle } from "../../../../../../src/lib/store/kinds/meta/writers.js";
import { ArchiveQuarterSchema, SlugSchema } from "../../../../../../src/lib/kernel/index.js";

const handEdit = { verb: "save", lifecycleAction: "edit" } as const;
const quarter = ArchiveQuarterSchema.parse("2026-q4");

function cohortDocument(name: string, sections: readonly string[], parent: string | null = null): string {
  return `# Cohort: \`${name}\`\n\n**Parent:** ${parent === null ? "[none]" : `\`${parent}\``}\n\n**Purpose:** Group work.\n\n`
    + `## Members\n${sections.map(slug => `\n### \`${slug}\`\n`).join("")}`;
}

async function fixture() {
  const h = createLifecycleHarness();
  const cohort = await h.seed(recordReferences["cohort/document"](OwnerIdentitySchema.parse({ type: "cohort", name: "group" })),
    cohortDocument("group", []));
  const members = [await h.seedMeta("member", { cohort: "group" }), await h.seedMeta("other", { cohort: "group" })];
  const edit = async (sections: readonly string[], reference: RecordReference = cohort.reference) => {
    const current = lifecycleSuccess(await h.store.read({ reference }));
    return h.store.write({ ...recordPut(current, { content: cohortDocument(current.reference.owner.name, sections) }), provenance: handEdit });
  };
  return { ...h, cohort, members, edit };
}

it("refuses a hand edit whose member section names no member, naming that slug, with nothing written", async () => {
  const h = await fixture(), before = lifecycleSuccess(await h.store.version());
  const refused = await h.edit(["member", "stray"]);
  expect(refused).toMatchObject({ status: "refused", refusal: { rule: "cohort.member-sections",
    condition: expect.stringContaining("`stray`"), remedy: { text: expect.stringMatching(/remove or rename/iu) } } });
  expect(refused).not.toMatchObject({ refusal: { condition: expect.stringContaining("`member`") } });
  expect(lifecycleSuccess(await h.store.version())).toBe(before);
});

it("refuses an orphan after a fenced level-two heading in Members", async () => {
  const h = await fixture();
  const repaired = cohortDocument("group", ["member"]) + "\n```md\n## Example\n```\n";
  const result = await h.store.write({ ...recordPut(h.cohort, { content: repaired + "\n### `stray`\n" }), provenance: handEdit });
  expect(result).toMatchObject({ status: "refused", refusal: { rule: "cohort.member-sections",
    condition: expect.stringContaining("`stray`"), remedy: { text: expect.stringMatching(/remove or rename/iu) } } });
  lifecycleSuccess(await h.store.write({ ...recordPut(h.cohort, { content: repaired }), provenance: handEdit }));
});

it("admits a member section containing a fenced example member heading", async () => {
  const h = await fixture();
  const content = cohortDocument("group", ["member"]) + "\n```md\n### `example`\n```\n";
  const result = await h.store.write({ ...recordPut(h.cohort, { content }), provenance: handEdit });
  expect(result).toMatchObject({ status: "ok" });
});

it.each(["removed", "renamed", "joined"] as const)("admits the edit once the stray section is %s", async repair => {
  const h = await fixture(), stray = await h.seedMeta("stray", { cohort: null });
  expect(await h.edit(["member", "stray"])).toMatchObject({ status: "refused" });
  if (repair === "joined") {
    lifecycleSuccess(await h.store.write({ ...recordPut(stray, { content: writeMetaCohort(stray.content, "group") }), provenance: handEdit }));
  }
  lifecycleSuccess(await h.edit(repair === "removed" ? ["member"] : repair === "renamed" ? ["member", "other"] : ["member", "stray"]));
});

it("admits a completed member's section", async () => {
  const h = await fixture();
  await h.seedMeta("done", { state: "Shipped", currentWorkflow: null, completed: "2026-10-01", prUrl: "https://example.test/pull/1",
    cohort: "group" }, { kind: "completed", quarter });
  lifecycleSuccess(await h.edit(["member", "done"]));
});

it("admits a proved member's section while another work unit's membership is disputed", async () => {
  const h = await fixture();
  await h.seed(recordReferences["cohort/document"](OwnerIdentitySchema.parse({ type: "cohort", name: "elsewhere" })),
    cohortDocument("elsewhere", []));
  const outside = await h.seedMeta("outside", { cohort: null });
  const joined = writeMetaCohort(outside.content, "group");
  const disputed = await conflictViewRecord(h, outside, writeMetaCohort(outside.content, "elsewhere"), joined);
  expect(disputed.conflicts).toHaveLength(1);

  expect(await h.edit(["outside"])).toMatchObject({ status: "refused", refusal: { rule: "cohort.member-sections",
    condition: expect.stringMatching(/outside.*conflict/iu), remedy: { text: expect.stringMatching(/resolve.*arc save/iu) } } });
  lifecycleSuccess(await h.edit(["member"]));
  lifecycleSuccess(await h.store.write({ ...recordPut(disputed, { content: joined }), resolves: disputed.conflicts,
    provenance: { verb: "resolve", lifecycleAction: "resolve" } }));
  lifecycleSuccess(await h.edit(["member", "outside"]));
});

it("admits a section for a member whose Cohort names the cohort by a former name", async () => {
  const h = await fixture();
  const reference = RecordReferenceSchema.parse({ ...h.cohort.reference, owner: { ...h.cohort.reference.owner, name: "current-group" } });
  lifecycleSuccess(await h.store.batch({ writes: [{ ...recordPut(h.cohort, { content: rewriteCohortHeading(h.cohort.content, "current-group") }),
    reference }], observations: observeRecords([h.cohort, ...h.members]), provenance: fixtureRenameProvenance }));
  lifecycleSuccess(await h.edit(["member", "other"], reference));
});

it.each(["a member's former name", "a subcohort", "a subcohort's member"] as const)("refuses a section naming only %s", async kind => {
  const h = await fixture();
  if (kind === "a member's former name") {
    const prior = await h.seedMeta("before", { cohort: "group" });
    const reference = RecordReferenceSchema.parse({ ...prior.reference, owner: { ...prior.reference.owner, name: "after" } });
    lifecycleSuccess(await h.store.write({ ...recordPut(prior, { content: writeMetaTitle(prior.content, SlugSchema.parse("after")) }),
      reference, provenance: fixtureRenameProvenance }));
  } else {
    await h.seed(recordReferences["cohort/document"](OwnerIdentitySchema.parse({ type: "cohort", name: "child" })),
      cohortDocument("child", [], "group"));
    if (kind === "a subcohort's member") await h.seedMeta("deep", { cohort: "group/child" });
  }
  const named = kind === "a member's former name" ? "before" : kind === "a subcohort" ? "child" : "deep";
  expect(await h.edit(["member", named])).toMatchObject({ status: "refused", refusal: { rule: "cohort.member-sections",
    condition: expect.stringContaining(`\`${named}\``) } });
});

it.each(["merges into a conflict with a concurrent edit", "lands while another cohort holds an open conflict"] as const)(
  "admits a hand edit that %s", async situation => {
    const h = await fixture();
    const own = situation === "merges into a conflict with a concurrent edit";
    if (own) lifecycleSuccess(await h.edit(["member"]));
    const target = own ? h.cohort
      : await h.seed(recordReferences["cohort/document"](OwnerIdentitySchema.parse({ type: "cohort", name: "elsewhere" })), cohortDocument("elsewhere", []));
    const base = lifecycleSuccess(await h.store.read({ reference: target.reference }));
    lifecycleSuccess(await h.store.write({ ...recordPut(base, { content: `${base.content}\nOne side.\n` }), provenance: handEdit }));
    const merged = await h.store.write({ ...recordPut(base, { content: `${base.content}\nOther side.\n` }), provenance: handEdit });
    expect(lifecycleSuccess(merged).conflicts).not.toEqual([]);
    lifecycleSuccess(await h.edit(["member", "other"]));
  });

it.each([
  { retained: "member", incoming: "departed" },
  { retained: "departed", incoming: "member" },
])("checks the retained `$retained` heading when it conflicts with the incoming `$incoming` heading", async ({ retained, incoming }) => {
  const h = await fixture();
  const departed = await h.seedMeta("departed", { cohort: "group" });
  const base = h.cohort;
  lifecycleSuccess(await h.edit([retained]));
  lifecycleSuccess(await h.store.write({ ...recordPut(departed, { content: writeMetaCohort(departed.content, null) }), provenance: handEdit }));
  const before = lifecycleSuccess(await h.store.version());
  const merged = await h.store.write({ ...recordPut(base, { content: cohortDocument("group", [incoming]) }), provenance: handEdit });

  if (retained === "departed") {
    expect(merged).toMatchObject({ status: "refused", refusal: { rule: "cohort.member-sections", condition: expect.stringContaining("`departed`") } });
    expect(lifecycleSuccess(await h.store.version())).toBe(before);
  } else {
    expect(lifecycleSuccess(merged).conflicts).toHaveLength(1);
    expect(lifecycleSuccess(await h.store.read({ reference: base.reference })).content).toBe(cohortDocument("group", [retained]));
  }
});
