/** Current recipient admission and provider checks for a cut's terminal dependency writes. */
import type { DecomposeContext } from "./context.js";
import type { DecomposeTerminalRecords } from "./acquire-terminal.js";
import type { DecomposeResult } from "./refusal.js";
import type { DecomposeDependencyFacts } from "./dependency-facts.js";
import type { DecomposeDependencyProjection } from "./dependency-projection.js";
import { acquireDecomposeDependencyFacts } from "./dependency-facts.js";
import { projectDecomposeDependencies } from "./dependency-projection.js";
import { decomposeReadCache } from "./read-cache.js";
import { checkDecomposeWrittenEdges } from "./check-written-edges.js";
import { decomposeReviseArgv } from "./command-argv.js";
import { renderV3DecomposeArgv } from "../work-unit/decompose-command-renderer.js";
import type { DecomposeRefusal } from "./refusal.js";

/** Fresh recipient facts and the dependency edits actually owned by the terminal batch. */
export interface DecomposeTerminalEdges { facts: DecomposeDependencyFacts; projection: DecomposeDependencyProjection }

/** Acquire current recipients and prepare the terminal dependency projection before any write. */
export async function prepareDecomposeTerminalEdges(ctx: DecomposeContext, input: DecomposeTerminalRecords): Promise<DecomposeResult<DecomposeTerminalEdges>> {
  const store = decomposeReadCache(ctx.executor.store, input.records);
  const reading = { ...ctx, executor: { ...ctx.executor, store } };
  const facts = await acquireDecomposeDependencyFacts(reading, input.map, input.acquired, input.homes);
  if (facts.status === "refused") return facts;
  const projection = projectDecomposeDependencies(input.map, facts.result, "terminal");
  if (projection.status === "refused") return terminalRepair(input, projection);
  const refused = await checkDecomposeWrittenEdges(reading, input.map, facts.result, projection.result);
  if (refused !== undefined) return terminalRepair(input, refused);
  return { status: "ok", result: { facts: facts.result, projection: projection.result } };
}

function terminalRepair(input: DecomposeTerminalRecords, refusal: DecomposeRefusal): DecomposeRefusal {
  if (refusal.reason === "store") return refusal;
  const argv = decomposeReviseArgv(input.acquired.primary.reference.owner.name);
  return { ...refusal, remedy: { text: `${refusal.remedy.text} Rebind this decision with ${renderV3DecomposeArgv(argv)}, then finish the revised cut.`, argv: [...argv] } };
}
