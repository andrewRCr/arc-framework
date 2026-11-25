/** Carry stored decisions only when fresh machine facts preserve their authority. */
import type { CutMap } from "./cut-map-schema.js";
import type { CutMapMachine } from "./cut-map-machine.js";
import type { DecomposeResult } from "./refusal.js";
import { DecomposeRevisionStarterReportSchema, type DecomposeRevisionStarterReport } from "./revision-starter-report.js";
import { createCutMapStarter } from "./cut-map-starter.js";
import { decodeCutMap } from "./cut-map-decode.js";
import { decomposeRebindMachineMismatch } from "./rebind-machine.js";

/** Replace the complete machine half, or retain the old authoring beside fresh author slots. */
export function rebindDecomposeMap(map: CutMap, machine: CutMapMachine): DecomposeResult<DecomposeRevisionStarterReport> {
  const starter = createCutMapStarter(machine);
  if (starter === null) return { status: "refused", reason: "machine-envelope", class: "recoverable", locus: "machine",
    remedy: { text: "Repair the current source and dependency facts, then generate the revision starter again." } };
  const mismatch = decomposeRebindMachineMismatch(map, machine);
  if (mismatch !== undefined) return { status: "ok", result: DecomposeRevisionStarterReportSchema.parse({
    status: "reauthor", ...mismatch, starter, storedAuthoring: map.authoring }) };
  const decoded = decodeCutMap({ schemaVersion: 4, machine, authoring: map.authoring });
  const report = decoded.status === "rejected"
    ? { status: "reauthor", reason: decoded.issue.code, locus: decoded.issue.path, starter, storedAuthoring: map.authoring }
    : { status: "carried", map: decoded.value };
  return { status: "ok", result: DecomposeRevisionStarterReportSchema.parse(report) };
}
