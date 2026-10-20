/** Byte-preserving thinning of a surviving origin's acquired design records. */
import type { CutMap } from "./cut-map-schema.js";
import type { DecomposeOriginRecords } from "./acquire-origin.js";
import type { DecomposeResult } from "./refusal.js";
import type { StoreRecord } from "../store/read.js";
import type { Mutation } from "../store/write.js";
import { scanV3DecomposeContent } from "../work-unit/decompose-content.js";
import { cutSourceId } from "./cut-map-machine.js";
import { decomposeMapRuleRefusal } from "./map-rule-refusal.js";
import { recordPut } from "../store/lifecycle-write.js";

/** A design artifact's retained content, or absence when no unit survives. */
export interface DecomposeThinnedArtifact { basename: string; record: StoreRecord; retainedContent: string | null }
/** Exact artifact results and only the mutations that change the origin. */
export interface DecomposeThinningPlan { artifacts: readonly DecomposeThinnedArtifact[]; writes: readonly Mutation[] }

/** Derive retained bytes from already acquired and source-bound records. */
export function planDecomposeSourceThinning(map: CutMap, acquired: DecomposeOriginRecords["artifacts"]): DecomposeResult<DecomposeThinningPlan> {
  const allocations = new Map(map.authoring.sourceAllocations.map(allocation => [allocation.sourceId, allocation]));
  const artifacts: DecomposeThinnedArtifact[] = [], writes: Mutation[] = [];
  for (const basename of [...map.machine.planningProfile.sourceDesign].sort()) {
    const source = acquired.find(artifact => artifact.basename === basename);
    if (source === undefined) return decomposeMapRuleRefusal("source-artifact", basename,
      "Restore the bound design record and revise the cut before finishing.");
    const thinned = retainDesignContent(basename, source.record.content, allocations);
    if (thinned.status === "refused") return thinned;
    const retainedContent = thinned.result;
    artifacts.push({ basename, record: source.record, retainedContent });
    if (retainedContent === null) writes.push({ action: "remove", reference: source.record.reference, expected: source.record.version });
    else if (retainedContent !== source.record.content) writes.push(recordPut(source.record, { content: retainedContent }));
  }
  return { status: "ok", result: { artifacts, writes } };
}

function retainDesignContent(basename: string, content: string,
  allocations: ReadonlyMap<string, CutMap["authoring"]["sourceAllocations"][number]>): DecomposeResult<string | null> {
  const scan = scanV3DecomposeContent(basename, Buffer.from(content, "utf8"));
  if (scan.status === "rejected") return decomposeMapRuleRefusal("source-artifact", basename,
    "Repair the design record's content and revise the cut before finishing.");
  const retained: Uint8Array[] = [];
  for (const unit of scan.units) {
    const allocation = allocations.get(cutSourceId({ sourceLocator: unit.locator }));
    if (allocation === undefined) return decomposeMapRuleRefusal("stale-machine", basename,
      "Rebind the origin's current units with --revise before finishing.");
    if (allocation.disposition.kind === "retained-origin") retained.push(unit.bytes);
  }
  return { status: "ok", result: retained.length === 0 ? null : Buffer.concat(retained).toString("utf8") };
}
