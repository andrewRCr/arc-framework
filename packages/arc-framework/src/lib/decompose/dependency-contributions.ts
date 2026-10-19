/** Canonically ordered incoming, outgoing, internal, and external dependency contributions. */
import type { CutMap } from "./cut-map-schema.js";
import { canonicalDigest } from "../kernel/canonical/canonical-json.js";

export type DecomposeDependencyContribution = {
  kind: "incoming"; edgeId: string; recipient: string; replacements: readonly string[]; locus: string;
} | {
  kind: "outgoing" | "internal" | "external"; edgeId: string; recipient: string; provider: string; locus: string;
};

/** Translate authored contributions into recipient-generation keys and stable edge order. */
export function decomposeDependencyContributions(map: CutMap, recipients: ReadonlyMap<string, string>): DecomposeDependencyContribution[] {
  const contributions: DecomposeDependencyContribution[] = [];
  for (const [index, edge] of map.machine.incomingEdges.entries()) {
    const authored = map.authoring.incomingDispositions[index];
    if (authored === undefined) continue;
    contributions.push({ kind: "incoming", edgeId: edge.edgeId, recipient: edge.dependent.uid,
      replacements: authored.disposition.kind === "replace" ? authored.disposition.replacementTargets : [],
      locus: `authoring.incomingDispositions.${index}.disposition` });
  }
  for (const [index, edge] of map.machine.outgoingEdges.entries()) {
    const authored = map.authoring.outgoingDispositions[index];
    if (authored?.disposition.kind !== "targets") continue;
    for (const [targetIndex, target] of authored.disposition.targets.entries()) contributions.push({ kind: "outgoing",
      edgeId: edge.edgeId, recipient: recipients.get(target) ?? target, provider: edge.provider.slug,
      locus: `authoring.outgoingDispositions.${index}.disposition.targets.${targetIndex}` });
  }
  for (const kind of ["internal", "external"] as const) {
    for (const [index, edge] of map.authoring[`${kind}Edges`].entries()) contributions.push({ kind,
      edgeId: canonicalDigest({ schemaVersion: 4, kind, from: edge.from, to: edge.to }),
      recipient: recipients.get(edge.from) ?? edge.from, provider: edge.to, locus: `authoring.${kind}Edges.${index}` });
  }
  return contributions.sort((a, b) => Buffer.compare(Buffer.from(a.edgeId), Buffer.from(b.edgeId))
    || Buffer.compare(Buffer.from(a.recipient), Buffer.from(b.recipient)));
}
