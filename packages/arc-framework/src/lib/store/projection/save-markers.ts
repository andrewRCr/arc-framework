/** Keep explicit save authorization behind the file's actual marker controls. */
import { renderRemedyArgument } from "../../../scripts/integration/spine-refusal.js";
import { formatConflictToken } from "../../status/conflict-token.js";
import type { RefusedMark } from "./index-schema.js";
import type { MarkerParseResult } from "./marker-parse.js";
import { scanMarkers } from "./marker-scan.js";
import type { TakeInRequest } from "./take-in-port.js";

/** A partial parse or standing target set cannot be resolved by an option. */
export function explicitResolutionMarkerRefusal(request: TakeInRequest, content: string,
  parsed: Extract<MarkerParseResult, { kind: "ready" }>): RefusedMark | null {
  const resolution = request.resolution;
  if (resolution === undefined) return null;
  if (parsed.retained !== undefined) return parsed.retained;
  const markers = request.entry.markers;
  if (markers === null) return null;
  const scan = scanMarkers(content, markers.length);
  const standing = resolution.kind === "hold" ? scan.controls.length > 0
    : scan.sets.some(set => set.opening.endsWith(`[arc-conflict: ${JSON.stringify(formatConflictToken(resolution.reference))}]`));
  const opening = request.path.startsWith(".arc/completed/") && request.entry.opened !== true
    ? editRemedy(request.checkout, request.path) : "";
  return !standing ? null : { reason: "The requested conflict still has markers in its projected file.",
    remedy: { text: `${opening}Resolve the shown markers by hand and remove their controls and resolve-by-hand line, then save again.` } };
}

/** Name the archive opening command with the checkout its path resolves from. */
export function editRemedy(checkout: string, path: string): string {
  return `Run arc edit ${renderRemedyArgument(path)} from ${checkout} first. `;
}
