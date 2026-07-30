/** Shared process-anchor selection for lock-holding locus mutations. */

import type { LocusAnchor } from "./schema/index.js";
import {
  createPlatformProcessAncestryInspector,
} from "./platform-inspectors.js";
import {
  acquireSessionAnchor,
  type ProcessAncestryInspector,
  type ProcessInspector,
} from "./process-inspector.js";

/**
 * Select the anchor a mutation holds its record lock under.
 *
 * Prefers the session anchor so a lock is attributable to the harness session; falls back to the
 * running command's own process when ancestry is unavailable.
 *
 * @param inspector - Platform process inspector used for the command-level fallback.
 * @param diagnostic - Operation-scoped prefix for the unavailable-anchor failure.
 * @param ancestryInspector - Platform ancestry boundary used for durable session selection.
 * @returns One verified process anchor.
 * @throws When neither the session nor the command process can be anchored.
 */
export async function selectLocusMutationAnchor(
  inspector: ProcessInspector,
  diagnostic: string,
  ancestryInspector: ProcessAncestryInspector = createPlatformProcessAncestryInspector(),
): Promise<Extract<LocusAnchor, { kind: "process" }>> {
  const selected = await acquireSessionAnchor(process.pid, ancestryInspector);
  if (selected.kind === "process") return selected;
  const command = await inspector.inspect(process.pid);
  if (command.kind !== "present") throw new Error(`${diagnostic}: ${selected.reason}`);
  return {
    kind: "process",
    pid: command.pid,
    startToken: command.startToken,
    inspector: inspector.kind,
    selector: "arc-command",
  };
}
