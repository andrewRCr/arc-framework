import { boundHolderLookup } from "../helpers/store/bound-checkout.js";
/** Store cut over the retirement repository's strict physical simulator. */
import { createRetirementHarness } from "../helpers/store/retirement-harness.js";
import { lifecycleSuccess } from "../helpers/store/lifecycle-harness.js";
import { decomposeContext } from "./decompose-context.js";
import { completeCutMapFixture } from "./decompose-v4.js";
import { prepareDecomposePreflight } from "../../src/lib/decompose/preflight.js";
import { runStoreDecomposeAdditive } from "../../src/lib/decompose/additive.js";
import { recordPut } from "../../src/lib/store/lifecycle-write.js";
import { writeMetaDesign } from "../../src/lib/store/kinds/meta/writers.js";
import { recordReferences } from "../../src/lib/store/identity.js";
import { createDefaultLocusPorts } from "../../src/lib/work-unit/locus-ports.js";

/** Seed a started Planning cut and bind every physical call to the scripted retirement repository. */
export async function createDecomposeRetirementFixture(options: Parameters<typeof createRetirementHarness>[0] = {}) {
  const h = await createRetirementHarness({ state: "Planning", branches: [], heldBranch: null, ...options, ended: false });
  const primary = lifecycleSuccess(await h.store.write({ ...recordPut(h.meta, {
    content: writeMetaDesign(h.meta.content, ["draft-demo.md"]) }), provenance: { verb: "write-back", lifecycleAction: "hand-edit" } }));
  await h.seed(recordReferences["work-item/draft"](primary.reference.owner), "# Demo\n\n## Scope\n\nOwned work.\n");
  const ctx = decomposeContext(h.store);
  const locusPorts = { ...createDefaultLocusPorts(), findHoldingCheckout: boundHolderLookup(h.meta, () => options.held ? "/repo" : null) };
  ctx.executor = { ...ctx.executor, exec: h.ctx.exec, locusPorts };
  ctx.removal = { exec: h.ctx.exec, readMarker: h.ctx.readMarker, folderExists: async () => true };
  ctx.storeTeardown = h.ctx;
  const fresh = await prepareDecomposePreflight(ctx, "demo");
  if (fresh.status === "refused") throw Error(JSON.stringify(fresh));
  const map = completeCutMapFixture(fresh.result.machine);
  const additive = await runStoreDecomposeAdditive(ctx, "demo", "execute", { cutMap: map, cutMapPath: "cut.json" });
  if (additive.status === "refused") throw Error(JSON.stringify(additive));
  return { ...h, ctx, map };
}
