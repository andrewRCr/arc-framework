/** A checked paired-spec extraction with authored members, a home, and retained companions. */
import { createDecomposeHarness } from "../helpers/store/decompose-harness.js";
import { lifecycleSuccess } from "../helpers/store/lifecycle-harness.js";
import { decomposeContext } from "./decompose-context.js";
import { completeCutMapFixture } from "./decompose-v4.js";
import { prepareDecomposePreflight } from "../../src/lib/decompose/preflight.js";
import { runStoreDecomposeAdditive } from "../../src/lib/decompose/additive.js";
import { recordReferences } from "../../src/lib/store/identity.js";
import { readWorkUnit } from "../../src/lib/store/lifecycle-write.js";
import { writeMetaDesign } from "../../src/lib/store/kinds/meta/writers.js";
import type { CutMap } from "../../src/lib/decompose/cut-map-schema.js";

/** Prepare a real additive batch and author its destinations through native write-back. */
export async function createDecomposeExtractionFixture(placement: CutMap["authoring"]["placement"] = { kind: "direct-member" }, active = false) {
  const h = createDecomposeHarness();
  await h.seedCohort("previous");
  if (placement.kind === "at-cap") {
    await h.seedCohort("group");
    await h.seedCohort("group/child");
  }
  await h.seedStub("provider");
  const initial = await h.seedMeta("origin", { state: active ? "Active" : "Planning",
    currentWorkflow: active ? "process-task-loop" : "generate-tasks", design: ["spec-origin.md"],
    taskList: "tasks-origin.md", cohort: "previous", dependsOn: ["provider"] });
  const owner = initial.reference.owner;
  const prd = await h.seed(recordReferences["work-item/companion"](owner, "spec-prd"),
    "# Origin PRD\n\n## Keep\n\nSurviving scope.\n\n## Move\n\nHome scope.\n");
  const rfc = await h.seed(recordReferences["work-item/companion"](owner, "spec-rfc"), "# Origin RFC\n\n## Transfer\n\nMember scope.\n");
  const primary = await h.handEdit(initial, writeMetaDesign(initial.content, ["spec-origin-prd.md", "spec-origin-rfc.md"]));
  const tasks = await h.seed(recordReferences["work-item/task-list"](owner),
    "# Task List: Origin\n\n## **Phase 1:** Work\n\n### `[ ]` **1.1 Do work**\n");
  const notes = await h.seed(recordReferences["work-item/notes"](owner), "# Notes\n\n## Decisions\n\nSurviving decisions.\n");
  const consumer = await h.seedMeta("consumer", { state: "Planning", currentWorkflow: null, dependsOn: ["origin"] },
    { kind: "backlog", commitment: "planned" });
  const home = await h.seedMeta("home", { state: "Planning", currentWorkflow: null, dependsOn: ["origin"], design: ["draft-home.md"] },
    { kind: "backlog", commitment: "planned" });
  const homeDraft = await h.seed(recordReferences["work-item/draft"](home.reference.owner), "# Home\n\n## Existing\n\nExisting work.\n");
  const ctx = decomposeContext(h.store);
  const preflight = await prepareDecomposePreflight(ctx, "origin");
  if (preflight.status === "refused") throw new Error(JSON.stringify(preflight));
  const map = completeCutMapFixture(preflight.result.machine, true);
  map.authoring.placement = placement;
  map.authoring.destinations.push({ kind: "existing-home", destinationId: "z-home", target: { kind: "work-unit", slug: "home" } });
  map.authoring.externalEdges = [{ from: "member-a", to: "origin" }];
  for (const incoming of map.authoring.incomingDispositions) incoming.disposition = { kind: "replace", replacementTargets: ["member-a"] };
  for (const outgoing of map.authoring.outgoingDispositions) outgoing.disposition = { kind: "targets", targets: ["home"] };
  for (const [index, unit] of map.machine.sourceUnits.entries()) {
    const allocation = map.authoring.sourceAllocations[index];
    if (allocation === undefined) throw new Error("Missing source allocation.");
    const locator = unit.sourceLocator;
    allocation.disposition = locator.artifact === "spec-origin-rfc.md"
      ? { kind: "target", destinationId: "member-a", targetLocator: { ...locator, artifact: "spec-member-a-rfc.md" } }
      : locator.artifact === "spec-origin-prd.md" && locator.kind === "section" && locator.headingSource === "Move"
        ? { kind: "target", destinationId: "z-home", targetLocator: { ...locator, artifact: "draft-home.md" } }
        : { kind: "retained-origin" };
  }
  const additive = await runStoreDecomposeAdditive(ctx, "origin", "extract", { cutMap: map, cutMapPath: "cut.json" });
  if (additive.status === "refused") throw new Error(JSON.stringify(additive));
  await h.handEdit(homeDraft, `${homeDraft.content}\n## Move\n\nAuthored home scope.\n`);
  const member = lifecycleSuccess(await readWorkUnit(h.store, "member-a"));
  const memberRfc = lifecycleSuccess(await h.store.read({ reference: recordReferences["work-item/companion"](member.reference.owner, "spec-rfc") }));
  await h.handEdit(memberRfc, `${memberRfc.content}\nAuthored destination detail.\n`);
  return { ...h, ctx, primary, prd, rfc, tasks: lifecycleSuccess(await h.store.read({ reference: tasks.reference })),
    notes: lifecycleSuccess(await h.store.read({ reference: notes.reference })), consumer, home, member, map, additive: additive.result };
}
