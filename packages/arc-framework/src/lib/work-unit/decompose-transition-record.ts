/** Projection from validated decomposition authoring into lean transition history. */

import { parseV3DecomposeCutMap, type V3DecomposeCutMap } from "./decompose-v3-schema.js";
import { parseTransitionRecord, type TransitionRecord } from "./transition-record.js";

/** Derive one lean record from a completed decomposition map. */
export function createDecomposeTransitionRecord(map: V3DecomposeCutMap): TransitionRecord | null {
  const parsed = parseV3DecomposeCutMap(map);
  if (parsed === null) return null;
  const dispositions = new Map(parsed.authoring.incomingDispositions.map((entry) => [entry.edgeId, entry]));
  const edges = parsed.machine.incomingEdges.map(({ dependent, edgeId }) => {
    const authored = dispositions.get(edgeId);
    return authored === undefined ? null : { dependent, disposition: authored.disposition };
  });
  if (edges.some((edge) => edge === null)) return null;
  const candidate = {
    schemaVersion: 1,
    origin: parsed.machine.source.origin,
    kind: "decompose",
    successors: parsed.authoring.destinations
      .flatMap((destination) => destination.kind === "new-member" ? [destination.slug] : [])
      .sort(compareUtf8),
    edges: edges.filter((edge) => edge !== null).sort((left, right) => compareUtf8(left.dependent, right.dependent)),
  };
  return parseTransitionRecord(JSON.stringify(candidate));
}

function compareUtf8(left: string, right: string): number {
  return Buffer.compare(Buffer.from(left, "utf8"), Buffer.from(right, "utf8"));
}
