/** A complete additive cut over checked records, ready for terminal authoring and validation. */
import { createDecomposeOriginFixture } from "./decompose-origin.js";
import { completeCutMapFixture } from "./decompose-v4.js";
import { prepareDecomposePreflight } from "../../src/lib/decompose/preflight.js";
import { runStoreDecomposeAdditive } from "../../src/lib/decompose/additive.js";
import { recordReferences } from "../../src/lib/store/identity.js";
import { writeMetaDependsOn, writeMetaCohort } from "../../src/lib/store/kinds/meta/writers.js";
import { readWorkUnit } from "../../src/lib/store/lifecycle-write.js";
import { lifecycleSuccess } from "../helpers/store/lifecycle-harness.js";
import type { CutMap } from "../../src/lib/decompose/cut-map-schema.js";

/** Land the production additive batch, optionally with an existing home or a surviving origin. */
export async function createDecomposeTerminalFixture(options: {
  withHome?: boolean; started?: boolean; reused?: boolean; extraction?: boolean; provider?: boolean; atCap?: boolean; draftContent?: string; authorMap?: (map: CutMap) => void;
} = {}) {
  const h = await createDecomposeOriginFixture(options.started, options.reused);
  if (options.draftContent !== undefined) await h.handEdit(h.draft, options.draftContent);
  if (options.provider) {
    await h.seedStub("provider");
    await h.handEdit(h.primary, writeMetaDependsOn(h.primary.content, ["provider"]));
  }
  const dependent = await h.seedStub("consumer");
  await h.handEdit(dependent, writeMetaDependsOn(dependent.content, ["origin"]));
  if (options.withHome) {
    const home = await h.seedStub("home");
    await h.handEdit(home, writeMetaDependsOn(home.content, ["origin"]));
    await h.seed(recordReferences["work-item/draft"](home.reference.owner), "# Home\n\n## Existing\n\nAuthored content.\n");
  }
  if (options.atCap) {
    await h.seedCohort("group");
    await h.seedCohort("group/child");
    const primary = lifecycleSuccess(await readWorkUnit(h.store, "origin"));
    await h.handEdit(primary, writeMetaCohort(primary.content, "group/child"));
  }
  const fresh = await prepareDecomposePreflight(h.ctx, "origin");
  if (fresh.status === "refused") throw new Error(JSON.stringify(fresh));
  const map = completeCutMapFixture(fresh.result.machine, options.extraction);
  if (options.atCap) map.authoring.placement = { kind: "at-cap", parent: "group/child" };
  if (options.withHome) {
    map.authoring.shape = "heterogeneous";
    map.authoring.destinations.push({ kind: "existing-home", destinationId: "z-home", target: { kind: "work-unit", slug: "home" } });
    const allocation = map.authoring.sourceAllocations[0];
    if (allocation?.disposition.kind !== "target") throw new Error("Expected source allocation.");
    allocation.disposition.destinationId = "z-home";
    allocation.disposition.targetLocator.artifact = "draft-home.md";
  }
  options.authorMap?.(map);
  const applied = await runStoreDecomposeAdditive(h.ctx, "origin", options.extraction ? "extract" : "execute", { cutMap: map, cutMapPath: "cut.json" });
  if (applied.status === "refused") throw new Error(JSON.stringify(applied));
  return { ...h, map, applied: applied.result };
}

