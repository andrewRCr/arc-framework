/** Content and dependency identity binding for a stored cut's current origin. */
import type { DecomposeContext } from "./context.js";
import type { DecomposeTerminalRecords } from "./acquire-terminal.js";
import type { DecomposeResult, DecomposeRefusal } from "./refusal.js";
import type { DecomposeSourceFacts } from "./source-facts.js";
import { deriveDecomposeSource } from "./source-facts.js";
import { canonicalize } from "../kernel/canonical/canonical-json.js";
import { decomposeReviseArgv } from "./command-argv.js";
import { renderV3DecomposeArgv } from "../work-unit/decompose-command-renderer.js";
import { deriveDecomposeEdges } from "./edge-facts.js";
import { checkDecomposeInbound } from "./start-guards.js";

/** Rescan the origin and require its allocated source and dependency inventories to remain bound. */
export function checkDecomposeSourceBinding(ctx: DecomposeContext, input: DecomposeTerminalRecords): DecomposeResult<DecomposeSourceFacts> {
  const source = deriveDecomposeSource(input.acquired);
  if (source.status === "refused") return source;
  const held = checkDecomposeInbound(ctx, input.acquired);
  if (held !== undefined) return held;
  const units = (facts: DecomposeSourceFacts) => facts.sourceUnits.map(unit => [unit.sourceId, unit.contentDigest]);
  if (canonicalize(units(source.result)) !== canonicalize(units(input.map.machine))) {
    return changed(input, "sourceUnits", "The origin's scanned content units were added, changed, or removed.");
  }
  const edges = deriveDecomposeEdges(input.acquired.edges);
  for (const direction of ["incomingEdges", "outgoingEdges"] as const) {
    if (canonicalize(edges[direction].map(edge => edge.edgeId))
      !== canonicalize(input.map.machine[direction].map(edge => edge.edgeId))) {
      return changed(input, direction, `The origin's ${direction === "incomingEdges" ? "incoming" : "outgoing"} dependency identities were added or removed.`);
    }
  }
  return source;
}

function changed(input: DecomposeTerminalRecords, inventory: string, message: string): DecomposeRefusal {
  const argv = decomposeReviseArgv(input.acquired.primary.reference.owner.name);
  return { status: "refused", reason: "stale-machine", class: "recoverable", locus: `machine.${inventory}`, message,
    remedy: { text: `Rebind the current origin's content and dependencies with ${renderV3DecomposeArgv(argv)}, then finish the revised cut.`, argv: [...argv] } };
}
