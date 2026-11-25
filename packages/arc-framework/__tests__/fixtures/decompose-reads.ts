/** A rich checked cut with an incoming dependent, a home, and at-cap cohort documents. */
import { createDecomposeOriginFixture } from "./decompose-origin.js";
import { completeCutMapFixture } from "./decompose-v4.js";
import { prepareDecomposePreflight } from "../../src/lib/decompose/preflight.js";
import { lifecycleSuccess } from "../helpers/store/lifecycle-harness.js";
import { readWorkUnit } from "../../src/lib/store/lifecycle-write.js";
import { recordReferences } from "../../src/lib/store/identity.js";
import { writeMetaDependsOn, writeMetaCohort } from "../../src/lib/store/kinds/meta/writers.js";

/** Build additive inputs before installing query instrumentation. */
export async function createDecomposeReadFixture() {
  const h = await createDecomposeOriginFixture();
  await h.seedStub("provider");
  const consumer = await h.seedStub("consumer");
  await h.handEdit(consumer, writeMetaDependsOn(consumer.content, ["origin"]));
  const home = await h.seedStub("home");
  await h.handEdit(home, writeMetaDependsOn(home.content, ["origin"]));
  await h.seed(recordReferences["work-item/draft"](home.reference.owner), "# Home\n\n## Scope\n\nExisting work.\n");
  await h.seedCohort("group");
  await h.seedCohort("group/child");
  const primary = lifecycleSuccess(await readWorkUnit(h.store, "origin"));
  await h.handEdit(primary, writeMetaCohort(writeMetaDependsOn(primary.content, ["provider"]), "group/child"));
  const fresh = await prepareDecomposePreflight(h.ctx, "origin");
  if (fresh.status === "refused") throw Error(JSON.stringify(fresh));
  const map = completeCutMapFixture(fresh.result.machine);
  map.authoring.shape = "heterogeneous";
  map.authoring.placement = { kind: "at-cap", parent: "group/child" };
  map.authoring.destinations.push({ kind: "existing-home", destinationId: "z-home", target: { kind: "work-unit", slug: "home" } });
  const allocation = map.authoring.sourceAllocations[0];
  if (allocation?.disposition.kind !== "target") throw Error("Expected allocated source.");
  allocation.disposition.destinationId = "z-home";
  allocation.disposition.targetLocator.artifact = "draft-home.md";
  return { ...h, map };
}
