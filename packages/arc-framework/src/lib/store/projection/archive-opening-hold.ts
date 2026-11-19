/** Keep archive edit admission separate from the latest retry diagnostic. */
import { renderRemedyArgument } from "../../../scripts/integration/spine-refusal.js";
import type { ProjectionIndex, RecordEntry, RefusedMark } from "./index-schema.js";

const forcedArchiveEdit = "An archived file was edited without opening it.";

/** Return the requirement an unopened archive correction must meet before admission. */
export function unopenedArchiveEditHold(entry: ProjectionIndex["entries"][string]): RefusedMark | null {
  if (entry.kind !== "record" || entry.opened === true) return null;
  return entry.openingHold ?? legacyOpeningHold(entry);
}

/** Preserve the requirement in older unsettled archive partitions that recorded it as a refusal. */
export function restoreLegacyOpeningHolds(entries: ProjectionIndex["entries"], group: string, unsettled: boolean): void {
  if (!unsettled || !group.startsWith(".arc/completed")) return;
  for (const entry of Object.values(entries)) {
    if (entry.kind !== "record" || entry.opened === true || entry.openingHold !== undefined) continue;
    const hold = legacyOpeningHold(entry);
    if (hold !== null) entry.openingHold = hold;
  }
}

/** Clear both the durable requirement and its legacy refusal when an opening or settlement satisfies it. */
export function clearArchiveOpeningHold(entry: RecordEntry): RecordEntry {
  const { openingHold, ...cleared } = entry;
  if (openingHold === undefined && legacyOpeningHold(entry) === null) return entry;
  return { ...cleared, refused: legacyOpeningHold(entry) === null ? entry.refused : null };
}

function legacyOpeningHold(entry: RecordEntry): RefusedMark | null {
  return entry.refused?.reason === forcedArchiveEdit ? entry.refused : null;
}

/** Keep the repair identical when observation or capture discovers an unopened archive correction. */
export function unopenedArchiveMark(checkout: string, path: string, known: boolean): RefusedMark {
  return { reason: known ? forcedArchiveEdit : "A new archived file has not been opened.",
    remedy: { text: `Run arc edit ${renderRemedyArgument(path)} then arc save from ${checkout} to retain this correction.` } };
}
