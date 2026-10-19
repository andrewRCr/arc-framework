/** Member scaffolds copy declared profiles and inherit the origin's semantic fields. */
import { expect, it } from "vitest";
import { createDecomposeHarness } from "../../../helpers/store/decompose-harness.js";
import { lifecycleSuccess } from "../../../helpers/store/lifecycle-harness.js";
import { decomposeContext } from "../../../fixtures/decompose-context.js";
import { completeCutMapFixture } from "../../../fixtures/decompose-v4.js";
import { recordReferences, OwnerIdentitySchema, sameReference } from "../../../../src/lib/store/identity.js";
import { writeMetaDesign } from "../../../../src/lib/store/kinds/meta/writers.js";
import { recordPut, readLifecycleMetaFields } from "../../../../src/lib/store/lifecycle-write.js";
import { prepareDecomposePreflight } from "../../../../src/lib/decompose/preflight.js";
import { checkDecomposeNames } from "../../../../src/lib/decompose/check-names.js";
import { planDecomposeTopology } from "../../../../src/lib/decompose/topology.js";
import { projectDecomposeDependencies } from "../../../../src/lib/decompose/dependency-projection.js";
import { planDecomposeMembers } from "../../../../src/lib/decompose/member-scaffold.js";
import type { DecomposeResult } from "../../../../src/lib/decompose/refusal.js";

function success<T>(result: DecomposeResult<T>): T {
  if (result.status === "refused") throw new Error(JSON.stringify(result));
  return result.result;
}

async function fixture(profile: "draft" | "single-spec" | "paired-spec" = "draft") {
  const h = createDecomposeHarness();
  await h.seedStub("provider");
  let primary = await h.seedMeta("origin", { state: "Planning", owner: "source-owner", priority: "P1", origin: "Source origin.",
    currentWorkflow: null, dependsOn: ["provider"] }, { kind: "backlog", commitment: "planned" });
  const owner = primary.reference.owner;
  const sourceDesign = profile === "paired-spec" ? ["spec-origin-prd.md", "spec-origin-rfc.md"]
    : [profile === "draft" ? "draft-origin.md" : "spec-origin.md"];
  for (const name of sourceDesign) {
    const reference = name.endsWith("-prd.md") ? recordReferences["work-item/companion"](owner, "spec-prd")
      : name.endsWith("-rfc.md") ? recordReferences["work-item/companion"](owner, "spec-rfc")
      : profile === "draft" ? recordReferences["work-item/draft"](owner) : recordReferences["work-item/spec"](owner);
    await h.seed(reference, "# origin design\n\n## Scope\n\nOwned work.\n");
  }
  lifecycleSuccess(await h.store.write({ ...recordPut(primary, { content: writeMetaDesign(primary.content, sourceDesign) }),
    provenance: { verb: "repoint-design", lifecycleAction: "spec-finalized" } }));
  primary = lifecycleSuccess(await h.store.read({ reference: primary.reference }));
  await h.seedCohort("group");
  const ctx = decomposeContext(h.store);
  const prepared = success(await prepareDecomposePreflight(ctx, "origin"));
  const map = completeCutMapFixture(prepared.machine);
  for (const allocation of map.authoring.sourceAllocations) {
    if (allocation.disposition.kind === "target") {
      const source = prepared.machine.sourceUnits.find(unit => unit.sourceId === allocation.sourceId);
      if (source === undefined) throw new Error("Expected source unit.");
      allocation.disposition.targetLocator.artifact = source.sourceLocator.artifact.replace("origin", "member-a");
    }
  }
  const topology = success(planDecomposeTopology(map, success(await checkDecomposeNames(h.store, map))));
  const dependencies = success(projectDecomposeDependencies(map, { origin: primary, dependents: [], homes: [], externalTargets: new Set() }));
  const plan = () => planDecomposeMembers(ctx, map, prepared.acquired, topology, dependencies);
  return { ...h, ctx, primary, prepared, map, topology, dependencies, plan };
}

it.each(["draft", "single-spec", "paired-spec"] as const)("seeds all member fields and own design copies under %s", async profile => {
  const h = await fixture(profile);
  const planned = success(h.plan());
  expect(planned.members.map(member => member.slug)).toEqual(["member-a", "member-b"]);
  lifecycleSuccess(await h.store.batch({ writes: [...planned.writes], provenance: { verb: "decompose", lifecycleAction: "additive" } }));
  for (const member of planned.members) {
    const primary = lifecycleSuccess(await h.store.read({ reference: member.primary }));
    const fields = lifecycleSuccess(readLifecycleMetaFields(primary));
    const expectedDesign = profile === "paired-spec" ? [`spec-${member.slug}-prd.md`, `spec-${member.slug}-rfc.md`]
      : [`${profile === "draft" ? "draft" : "spec"}-${member.slug}.md`];
    expect(primary.placement).toEqual({ kind: "backlog", commitment: "planned" });
    expect(fields).toMatchObject({ state: "Planning", owner: "source-owner", priority: "P1", origin: "Source origin.",
      workClass: member.slug === "member-a" ? "Light" : "Heavy", cohort: "group", design: expectedDesign,
      dependsOn: member.slug === "member-a" ? ["member-b"] : ["provider"],
      currentWorkflow: profile === "draft" ? "draft-design" : "generate-tasks",
      nextAction: `Begin ${profile === "draft" ? "draft-design" : "generate-tasks"}` });
    expect(member.copies.map(copy => copy.basename)).toEqual(expectedDesign);
    for (const copy of member.copies) expect(lifecycleSuccess(await h.store.read({ reference: copy.reference })).content)
      .toBe(`# ${member.slug} design\n\n## Scope\n\nOwned work.\n`);
  }
  const untouched = lifecycleSuccess(await h.store.read({ reference: recordReferences["work-item/meta"](OwnerIdentitySchema.parse({ type: "work-item", name: "origin" })) }));
  expect(untouched.version).toEqual(h.primary.version);
});

const taskText = "# Tasks origin\n\n## **Phase 1:** Work\n\n### `[ ]` **1.1 Work**\n\n- _Goal:_ Keep work bounded.\n";

async function companionFixture(role: "tasks" | "notes", content: string) {
  const h = await fixture();
  const reference = role === "tasks" ? recordReferences["work-item/task-list"](h.primary.reference.owner)
    : recordReferences["work-item/notes"](h.primary.reference.owner);
  const source = await h.seed(reference, content);
  const plan = async (targeted = true, targetRole = role) => {
    const fresh = success(await prepareDecomposePreflight(h.ctx, "origin"));
    const map = completeCutMapFixture(fresh.machine);
    if (targeted) for (const allocation of map.authoring.sourceAllocations) {
      const unit = fresh.machine.sourceUnits.find(item => item.sourceId === allocation.sourceId);
      if (unit?.sourceLocator.artifact === `${role}-origin.md` && allocation.disposition.kind === "target")
        allocation.disposition.targetLocator.artifact = `${targetRole}-member-a.md`;
    }
    return planDecomposeMembers(h.ctx, map, fresh.acquired, h.topology, h.dependencies);
  };
  return { ...h, source, planCompanion: plan };
}

it.each(["tasks", "notes"] as const)("copies %s only to an allocated member", async role => {
  const text = role === "tasks" ? taskText : "# Shared notes\n\n## Scope\n\nShared work.\n";
  const h = await companionFixture(role, text);
  const targeted = success(await h.planCompanion());
  expect(targeted.members[0]?.copies.map(copy => copy.basename)).toContain(`${role}-member-a.md`);
  expect(targeted.members[1]?.copies.map(copy => copy.basename)).not.toContain(`${role}-member-b.md`);
  const copy = targeted.writes.find(write => write.reference.owner.name === "member-a"
    && write.reference.kind === (role === "tasks" ? "work-item/task-list" : "work-item/notes"));
  expect(copy).toMatchObject({ action: "put", content: role === "tasks" ? text.replace("# Tasks origin", "# Tasks member-a") : text });
  const untargeted = success(await h.planCompanion(false));
  expect(untargeted.members.flatMap(member => member.copies.map(item => item.basename))).not.toContain(`${role}-member-a.md`);
  lifecycleSuccess(await h.store.batch({ writes: [...targeted.writes], provenance: { verb: "decompose", lifecycleAction: "additive" } }));
});

it("refuses an untitled task-list copy and admits it after the source title is restored", async () => {
  const h = await companionFixture("tasks", taskText.replace("# Tasks origin\n", ""));
  expect(await h.planCompanion()).toMatchObject({ status: "refused", reason: "scaffold-title-missing", class: "recoverable", locus: "tasks-origin.md" });
  await h.handEdit(h.source, taskText);
  const repaired = success(await h.planCompanion());
  lifecycleSuccess(await h.store.batch({ writes: [...repaired.writes], provenance: { verb: "decompose", lifecycleAction: "additive" } }));
});

it("refuses copying completed tasks and admits targeting notes instead", async () => {
  const h = await companionFixture("tasks", taskText.replace("`[ ]`", "`[x]`"));
  await h.seed(recordReferences["work-item/notes"](h.primary.reference.owner), "# Notes origin\n\n## Scope\n\nWork.\n");
  const refused = await h.planCompanion();
  expect(refused).toMatchObject({ status: "refused", reason: "completed-task", class: "recoverable", locus: "tasks-origin.md" });
  if (refused.status !== "refused") throw new Error("Expected refusal.");
  expect(refused.message).toContain("1.1");
  const repaired = success(await h.planCompanion(true, "notes"));
  expect(repaired.members[0]?.copies.map(copy => copy.basename)).toContain("notes-member-a.md");
  expect(repaired.members[0]?.copies.map(copy => copy.basename)).not.toContain("tasks-member-a.md");
  lifecycleSuccess(await h.store.batch({ writes: [...repaired.writes], provenance: { verb: "decompose", lifecycleAction: "additive" } }));
});

it("copies deferred tasks, which remain removable", async () => {
  const h = await companionFixture("tasks", taskText.replace("`[ ]`", "`[~]`"));
  const planned = success(await h.planCompanion());
  expect(planned.members[0]?.copies.map(copy => copy.basename)).toContain("tasks-member-a.md");
  lifecycleSuccess(await h.store.batch({ writes: [...planned.writes], provenance: { verb: "decompose", lifecycleAction: "additive" } }));
});

it.each(["descriptor", "segmentation"] as const)("names a legacy source's %s diagnostic and admits its repaired copy", async rule => {
  const h = await companionFixture("tasks", taskText);
  const invalid = rule === "descriptor" ? taskText.replace("- _Goal:_ Keep work bounded.",
    "- _Goal:_ Keep work bounded across\n  a wrapped line.\n- _Context:_ Preserve context.")
    : taskText.replace("## **Phase 1:** Work", "## **Phase 1:** Work\n\n_Mode:_ `layer`");
  // Represent a legacy source predating the task-list creation checks, which reject this new file today.
  for (const record of h.store.state.records.values()) if (sameReference(record.reference, h.source.reference)) record.content = invalid;
  const refused = await h.planCompanion();
  expect(refused).toMatchObject({ status: "refused", reason: "scaffold-task-list", class: "recoverable", locus: "tasks-origin.md" });
  if (refused.status !== "refused") throw new Error("Expected refusal.");
  expect(refused.message).toContain(`task-list.${rule}`);
  await h.handEdit(h.source, taskText);
  const repaired = success(await h.planCompanion());
  lifecycleSuccess(await h.store.batch({ writes: [...repaired.writes], provenance: { verb: "decompose", lifecycleAction: "additive" } }));
});
