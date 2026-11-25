/** Checked draft-profile origin and its bound dependency plan for provider scenarios. */
import { createDecomposeOriginFixture } from "./decompose-origin.js";
import { completeCutMapFixture } from "./decompose-v4.js";
import { prepareDecomposePreflight } from "../../src/lib/decompose/preflight.js";
import { acquireDecomposeDependencyFacts } from "../../src/lib/decompose/dependency-facts.js";
import { projectDecomposeDependencies } from "../../src/lib/decompose/dependency-projection.js";
import { checkDecomposeHomes } from "../../src/lib/decompose/check-homes.js";
import { writeMetaDependsOn } from "../../src/lib/store/kinds/meta/writers.js";
import type { CutMap } from "../../src/lib/decompose/cut-map-schema.js";

/** Seed one outgoing provider before recording its edge and binding the completed map. */
export async function createDecomposePlanFixture(started = false) {
  const h = await createDecomposeOriginFixture(started);
  const provider = await h.seedStub("provider");
  await h.handEdit(h.primary, writeMetaDependsOn(h.primary.content, ["provider"]));
  const prepared = await prepareDecomposePreflight(h.ctx, "origin");
  if (prepared.status === "refused") throw new Error(JSON.stringify(prepared));
  const map = completeCutMapFixture(prepared.result.machine, started);
  const plan = async (selected: CutMap = map) => {
    const current = await prepareDecomposePreflight(h.ctx, "origin");
    if (current.status === "refused") throw new Error(JSON.stringify(current));
    const homes = await checkDecomposeHomes(h.ctx, selected);
    if (homes.status === "refused") throw new Error(JSON.stringify(homes));
    const facts = await acquireDecomposeDependencyFacts(h.ctx, selected, current.result.acquired, homes.result);
    if (facts.status === "refused") throw new Error(JSON.stringify(facts));
    const projection = projectDecomposeDependencies(selected, facts.result);
    if (projection.status === "refused") throw new Error(JSON.stringify(projection));
    return { facts: facts.result, projection: projection.result };
  };
  return { ...h, provider, prepared: prepared.result, map, plan };
}
