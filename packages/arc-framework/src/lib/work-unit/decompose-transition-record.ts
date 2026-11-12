/** Projection from validated decomposition authoring into lean transition history. */

import { parseV3DecomposeCutMap, type V3DecomposeCutMap } from "./decompose-v3-schema.js";
import { parseLineageRecord, type LineageRecord } from "../store/kinds/lineage/index.js";

/** Derive terminal history from a completed decomposition map.
 * @param map - Authored cut with authenticated incoming and outgoing edges.
 * @returns The lineage record, or null when the cut or projection refuses.
 */
export function createDecomposeTransitionRecord(map: V3DecomposeCutMap): LineageRecord | null {
  const parsed = parseV3DecomposeCutMap(map);
  if (parsed === null) return null;
  const dispositions = new Map(parsed.authoring.incomingDispositions.map((entry) => [entry.edgeId, entry]));
  const incoming = parsed.machine.incomingEdges.map(({ dependent, edgeId }) => {
    const authored = dispositions.get(edgeId);
    if (authored === undefined) return null;
    const disposition = authored.disposition.kind === "replace"
      ? { ...authored.disposition, replacementTargets: authored.disposition.replacementTargets.map((name) => ({ name })) }
      : authored.disposition;
    return { dependent: { name: dependent }, disposition };
  });
  const outgoingDispositions = new Map(parsed.authoring.outgoingDispositions.map((entry) => [entry.edgeId, entry.disposition]));
  const outgoing = parsed.machine.outgoingEdges.map(({ prerequisite, edgeId }) => {
    const disposition = outgoingDispositions.get(edgeId);
    return disposition === undefined ? null : {
      prerequisite: { name: prerequisite },
      members: disposition.kind === "targets" ? disposition.targets.map((name) => ({ name })) : [],
    };
  });
  if (incoming.some((edge) => edge === null) || outgoing.some((edge) => edge === null)) return null;
  const candidate = {
    schemaVersion: 2,
    origin: { name: parsed.machine.source.origin },
    kind: "decompose",
    successors: parsed.authoring.destinations
      .flatMap((destination) => destination.kind === "new-member" ? [{ name: destination.slug }] : [])
      .sort((left, right) => compareUtf8(left.name, right.name)),
    incoming: incoming.filter((edge) => edge !== null).sort((left, right) => compareUtf8(left.dependent.name, right.dependent.name)),
    outgoing: outgoing.filter((edge) => edge !== null).sort((left, right) => compareUtf8(left.prerequisite.name, right.prerequisite.name)),
  };
  return parseLineageRecord(JSON.stringify(candidate));
}

function compareUtf8(left: string, right: string): number {
  return Buffer.compare(Buffer.from(left, "utf8"), Buffer.from(right, "utf8"));
}
