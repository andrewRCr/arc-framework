/** Shape admission over the origin's current terminal-preparation records. */
import type { DecomposeTerminalRecords } from "./acquire-terminal.js";
import type { DecomposeResult } from "./refusal.js";
import type { DecomposeSourceFacts } from "./source-facts.js";
import { deriveDecomposeSource } from "./source-facts.js";
import { decomposeDiscardArgv, decomposeReviseArgv } from "./command-argv.js";
import { renderV3DecomposeArgv } from "../work-unit/decompose-command-renderer.js";
import { readLifecycleMetaFields } from "../store/lifecycle-write.js";
import { decomposeStoreRefusal } from "./refusal.js";

/** Validate the origin's current kind before preparing a terminal preview. */
export function checkDecomposeTerminalOrigin(input: Pick<DecomposeTerminalRecords, "map" | "acquired">): DecomposeResult<DecomposeSourceFacts> {
  const primary = input.acquired.primary;
  const origin = primary.reference.owner.name;
  if (origin !== input.map.machine.origin.slug) {
    const argv = decomposeReviseArgv(origin);
    return { status: "refused", reason: "origin-changed", class: "recoverable", locus: "machine.origin.slug",
      remedy: { text: `Rebind the renamed origin with ${renderV3DecomposeArgv(argv)}, then finish the revised cut.`, argv: [...argv] } };
  }
  const fields = readLifecycleMetaFields(primary);
  if (fields.status === "refused") return decomposeStoreRefusal(fields.refusal);
  if (primary.placement?.kind === "completed") {
    const argv = decomposeDiscardArgv(origin);
    return { status: "refused", reason: "origin-kind", class: "recoverable", locus: "State",
      remedy: { text: `An archived origin cannot finish a cut; discard it with ${renderV3DecomposeArgv(argv)}.`, argv: [...argv] } };
  }
  if (primary.placement?.kind === "active" && fields.result.state === "Integrating") {
    const argv = ["arc", "reopen", origin];
    const deactivate = input.map.authoring.shape === "extraction" ? "" : `, then ${renderV3DecomposeArgv(["arc", "deactivate", origin])}`;
    return { status: "refused", reason: "origin-kind", class: "recoverable", locus: "State",
      remedy: { text: `Run ${renderV3DecomposeArgv(argv)}${deactivate} before finishing, or ${renderV3DecomposeArgv(decomposeDiscardArgv(origin))}.`, argv } };
  }
  const source = deriveDecomposeSource(input.acquired);
  if (source.status === "refused") return source;
  if (source.result.sourceKind === "active-origin" && input.map.authoring.shape !== "extraction") {
    const argv = ["arc", "deactivate", origin];
    return { status: "refused", reason: "origin-kind", class: "recoverable", locus: "State",
      remedy: { text: `Run ${renderV3DecomposeArgv(argv)} before finishing a retirement, or ${renderV3DecomposeArgv(decomposeDiscardArgv(origin))}.`, argv } };
  }
  return source;
}
