/** Read-only starter-map emission for a new store-backed decomposition. */
import type { DecomposeContext } from "./context.js";
import type { DecomposeResult } from "./refusal.js";
import type { DecomposeOriginRecords } from "./acquire-origin.js";
import type { CutMapMachine } from "./cut-map-machine.js";
import { acquireDecomposeOrigin } from "./acquire-origin.js";
import { checkDecomposeStart } from "./start-guards.js";
import { deriveDecomposeMachine } from "./machine-facts.js";
import { createCutMapStarter } from "./cut-map-starter.js";
import { canonicalize } from "../kernel/canonical/canonical-json.js";

/** Fresh observations and their derived machine for a new cut. */
export interface DecomposePreflight {
  acquired: DecomposeOriginRecords;
  machine: CutMapMachine;
}

/** Repeat new-cut admission and derive the machine from one fresh acquisition. */
export async function prepareDecomposePreflight(ctx: DecomposeContext, origin: string): Promise<DecomposeResult<DecomposePreflight>> {
  const acquired = await acquireDecomposeOrigin(ctx, origin);
  if (acquired.status === "refused") return acquired;
  const held = checkDecomposeStart(ctx, acquired.result);
  if (held !== undefined) return held;
  const machine = deriveDecomposeMachine(acquired.result);
  if (machine.status === "refused") return machine;
  return { status: "ok", result: { acquired: acquired.result, machine: machine.result } };
}

/** Emit a canonical starter map without changing stored records. */
export async function runStoreDecomposePreflight(ctx: DecomposeContext, origin: string): Promise<DecomposeResult<string>> {
  const prepared = await prepareDecomposePreflight(ctx, origin);
  if (prepared.status === "refused") return prepared;
  const starter = createCutMapStarter(prepared.result.machine);
  if (starter === null) return { status: "refused", reason: "machine-envelope", class: "recoverable",
    locus: "machine", remedy: { text: "Repair the origin's source and dependency facts, then retry preflight." } };
  return { status: "ok", result: canonicalize(starter) };
}
