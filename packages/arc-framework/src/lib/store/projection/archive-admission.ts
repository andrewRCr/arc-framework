/** Decide from an archived file's entry and route alone whether an edit to it may reach the store. */
import { renderRemedyArgument } from "../../../scripts/integration/spine-refusal.js";
import { isProjectionEntryUnsettled } from "./index-file.js";
import type { ProjectionIndex, RefusedMark } from "./index-schema.js";
import type { TakeInRequest } from "./take-in-port.js";

const forcedArchiveEdit = "An archived file was edited without opening it.";

/**
 * Whether an edit to an archived file waits for an opening. It lands only where its entry is opened, where it is the
 * subject `arc save --resolve` names, or where a refresh's replace guard meets it over a settled entry.
 */
export function archivedEditWaits(request: Pick<TakeInRequest, "path" | "entry" | "resolution" | "forcedEdit">): boolean {
  if (!request.path.startsWith(".arc/completed/") || request.entry.opened === true || request.resolution !== undefined) return false;
  return request.forcedEdit !== true || isProjectionEntryUnsettled(request.entry);
}

/** Work the store already accepted for an entry, which finishes without an opening and admits no further bytes. */
export function hasAcceptedLanding(entry: ProjectionIndex["entries"][string] | undefined): boolean {
  return entry?.archiveSubmission !== undefined
    || entry?.kind === "record" && (entry.adoption?.kind === "read-back" || entry.persisted?.recording === true);
}

/** The remedy every route names for an archived edit that waits, where the edit rights allow the edit. */
export function waitingEditMark(checkout: string, path: string, known: boolean): RefusedMark {
  return { reason: known ? forcedArchiveEdit : "A new archived file has not been opened.",
    remedy: { text: `Run arc edit ${renderRemedyArgument(path)} then arc save from ${checkout} to retain this correction.` } };
}
