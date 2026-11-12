/** Human output for labelled open conflict records in their preserved merge shapes. */
import { ConflictRecordSchema, type ConflictRecord } from "../store/conflict.js";
import type { StatusConflictRecord } from "./store-conflicts.js";
/** Render tokens, subjects and preserved merge evidence without mutating records. */
export function renderStoreConflicts(records: readonly StatusConflictRecord[]): string {
  return records.length === 0 ? "No open store conflicts." : records.map(renderConflict).join("\n\n");
}
function renderConflict(record: StatusConflictRecord): string {
  const conflict = ConflictRecordSchema.parse(JSON.parse(record.content));
  const lines = [`## ${record.token}`, `Subject: ${JSON.stringify(conflict.record)}`];
  if (conflict.location.kind === "hunk") lines.push(`Lines (zero-based, end-exclusive): [${conflict.location.start}, ${conflict.location.end})`);
  if (conflict.location.kind === "entry") lines.push(`Entry: ${conflict.location.id}`);
  if ("baseSection" in conflict) lines.push(`Base section: ${conflict.baseSection ?? "(none)"}`);
  lines.push("Base:", typeof conflict.base === "string" ? conflict.base : JSON.stringify(conflict.base, null, 2),
    renderSide("Current", conflict.current), renderSide("Incoming", conflict.incoming));
  return lines.join("\n");
}
function renderSide(name: string, side: ConflictRecord["current"]): string {
  const lines = [`${name}: ${side.label.actor} @ ${side.label.time}`];
  if ("section" in side) lines.push(`${name} section: ${side.section}`);
  lines.push("value" in side ? side.value === null ? "Removed the record." : JSON.stringify(side.value, null, 2) : side.content);
  return lines.join("\n");
}
