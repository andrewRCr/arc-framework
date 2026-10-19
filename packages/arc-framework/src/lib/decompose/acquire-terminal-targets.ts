/** Existing destination and cohort observations for a stored decomposition. */
import type { DecomposeContext } from "./context.js";
import type { CutMap } from "./cut-map-schema.js";
import type { DecomposeResult } from "./refusal.js";
import type { Store } from "../store/contract.js";
import type { StoreRecord } from "../store/read.js";
import type { DecomposeCohortObservation } from "./check-names.js";
import type { DecomposeHome } from "./check-homes.js";
import { checkDecomposeHomes } from "./check-homes.js";
import { acquireLifecycleRecords } from "../work-unit/prepared-lifecycle-write.js";
import { OwnerIdentitySchema, recordReferences } from "../store/identity.js";
import { parseCohortDocument } from "../store/kinds/cohort/index.js";
import { decomposeStoreRefusal } from "./refusal.js";
import { decomposeReviseArgv } from "./command-argv.js";
import { renderV3DecomposeArgv } from "../work-unit/decompose-command-renderer.js";

/** An existing home and its complete version-bound artifact group. */
export interface DecomposeTerminalHome extends DecomposeHome { records: readonly StoreRecord[] }

/** Resolve existing homes before acquiring their artifact groups. */
export async function acquireDecomposeTerminalHomes(ctx: DecomposeContext, map: CutMap): Promise<DecomposeResult<readonly DecomposeTerminalHome[]>> {
  const homes = await checkDecomposeHomes(ctx, map);
  if (homes.status === "refused") {
    if (homes.reason !== "existing-home") return homes;
    const argv = decomposeReviseArgv(map.machine.origin.slug);
    return { ...homes, remedy: { text: `Retarget this home's allocations with ${renderV3DecomposeArgv(argv)}, then finish the revised cut.`, argv: [...argv] } };
  }
  const acquired: DecomposeTerminalHome[] = [];
  for (const home of homes.result) {
    const group = await acquireLifecycleRecords(ctx.executor.store, home.primary.reference.owner.name);
    if (group.status === "refused") return decomposeStoreRefusal(group.refusal);
    acquired.push({ ...home, records: group.result });
  }
  return { status: "ok", result: acquired };
}

/** Acquire each named cohort document, retaining its parsed path and exact version. */
export async function acquireDecomposeTerminalCohorts(store: Store, map: CutMap): Promise<DecomposeResult<readonly DecomposeCohortObservation[]>> {
  const placement = map.authoring.placement;
  const path = placement.kind === "direct-member" ? null : placement.kind === "at-cap" ? placement.parent : placement.cohort;
  const paths = path === null ? [] : path.includes("/") ? [path.split("/")[0] ?? path, path] : [path];
  const cohorts: DecomposeCohortObservation[] = [];
  for (const path of paths) {
    const owner = OwnerIdentitySchema.parse({ type: "cohort", name: path.split("/").at(-1) });
    const record = await store.read({ reference: recordReferences["cohort/document"](owner) });
    if (record.status === "refused") return decomposeStoreRefusal(record.refusal);
    const parsed = parseCohortDocument(record.result.content);
    const expectedParent = path.includes("/") ? path.split("/")[0] : null;
    if (!parsed.success || parsed.data.parent !== expectedParent || record.result.placement?.kind === "completed") {
      return { status: "refused", reason: "cohort-parent", class: "recoverable", locus: path,
        remedy: { text: "Restore the named open cohort document and its Parent through write-back, or --revise the cut's placement." } };
    }
    cohorts.push({ path, record: record.result });
  }
  return { status: "ok", result: cohorts };
}
