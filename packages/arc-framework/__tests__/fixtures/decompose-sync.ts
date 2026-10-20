/** Independent checked clones of one origin, with real concurrent additive batches. */
import { createDecomposeOriginFixture } from "./decompose-origin.js";
import { decomposeContext } from "./decompose-context.js";
import { completeCutMapFixture } from "./decompose-v4.js";
import { createLifecycleHarness, lifecycleSuccess } from "../helpers/store/lifecycle-harness.js";
import { createMemoryRemote } from "../helpers/store/sync.js";
import { prepareDecomposePreflight } from "../../src/lib/decompose/preflight.js";
import { runStoreDecomposeAdditive } from "../../src/lib/decompose/additive.js";
import { CutMapSchema } from "../../src/lib/decompose/cut-map-schema.js";
import type { DecomposeContext } from "../../src/lib/decompose/context.js";

/** Pull a common origin before either independent client starts a cut. */
export async function createDecomposeCloneFixture() {
  const left = await createDecomposeOriginFixture();
  const remote = createMemoryRemote();
  left.store.context.publication.remote = remote;
  lifecycleSuccess(await left.store.sync());
  const right = createLifecycleHarness();
  right.store.context.publication.remote = remote;
  lifecycleSuccess(await right.store.sync());
  return { left, right: { ...right, ctx: decomposeContext(right.store) }, remote };
}

/** Author and persist a cut with a distinct member and cohort namespace. */
export async function addConcurrentDecomposeCut(ctx: DecomposeContext, prefix: string, cohort = `${prefix}-group`) {
  const fresh = await prepareDecomposePreflight(ctx, "origin");
  if (fresh.status === "refused") throw new Error(JSON.stringify(fresh));
  const completed = completeCutMapFixture(fresh.result.machine);
  const map = CutMapSchema.parse(JSON.parse(JSON.stringify(completed)
    .replaceAll("member-a", `${prefix}-a`).replaceAll("member-b", `${prefix}-b`)));
  map.authoring.placement = { kind: "cohort", cohort, purpose: "Coordinate the concurrent cut." };
  const result = await runStoreDecomposeAdditive(ctx, "origin", "execute", { cutMap: map, cutMapPath: `${prefix}.json` });
  if (result.status === "refused") throw new Error(JSON.stringify(result));
  return { map, applied: result.result };
}
