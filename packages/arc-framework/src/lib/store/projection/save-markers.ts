/** Keep explicit save authorization behind the file's actual marker controls. */
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
  return !standing ? null : { reason: "The requested conflict still has markers in its projected file.",
    remedy: { text: "Resolve the shown markers by hand and remove their controls and resolve-by-hand line, then save again." } };
}
