/** A complete additive cut over checked records, ready for terminal authoring and validation. */
import { createDecomposeOriginFixture } from "./decompose-origin.js";
import { completeCutMapFixture } from "./decompose-v4.js";
import { prepareDecomposePreflight } from "../../src/lib/decompose/preflight.js";
import { runStoreDecomposeAdditive } from "../../src/lib/decompose/additive.js";
import { recordReferences } from "../../src/lib/store/identity.js";
import { writeMetaDependsOn } from "../../src/lib/store/kinds/meta/writers.js";

/** Land the production additive batch, optionally with an existing home or a surviving origin. */
export async function createDecomposeTerminalFixture(options: { withHome?: boolean; started?: boolean; extraction?: boolean } = {}) {
  const h = await createDecomposeOriginFixture(options.started);
  const dependent = await h.seedStub("consumer");
  await h.handEdit(dependent, writeMetaDependsOn(dependent.content, ["origin"]));
  if (options.withHome) {
    const home = await h.seedStub("home");
    await h.handEdit(home, writeMetaDependsOn(home.content, ["origin"]));
    await h.seed(recordReferences["work-item/draft"](home.reference.owner), "# Home\n\n## Existing\n\nAuthored content.\n");
  }
  const fresh = await prepareDecomposePreflight(h.ctx, "origin");
  if (fresh.status === "refused") throw new Error(JSON.stringify(fresh));
  const map = completeCutMapFixture(fresh.result.machine, options.extraction);
  if (options.withHome) {
    map.authoring.shape = "heterogeneous";
    map.authoring.destinations.push({ kind: "existing-home", destinationId: "z-home", target: { kind: "work-unit", slug: "home" } });
    const allocation = map.authoring.sourceAllocations[0];
    if (allocation?.disposition.kind !== "target") throw new Error("Expected source allocation.");
    allocation.disposition.destinationId = "z-home";
    allocation.disposition.targetLocator.artifact = "draft-home.md";
  }
  const applied = await runStoreDecomposeAdditive(h.ctx, "origin", options.extraction ? "extract" : "execute", { cutMap: map, cutMapPath: "cut.json" });
  if (applied.status === "refused") throw new Error(JSON.stringify(applied));
  return { ...h, map, applied: applied.result };
}

