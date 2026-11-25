/** Complete pure machine derivation from one acquired decomposition origin. */
import type { DecomposeOriginRecords } from "./acquire-origin.js";
import type { CutMapMachine } from "./cut-map-machine.js";
import type { DecomposeResult } from "./refusal.js";
import { deriveDecomposeSource } from "./source-facts.js";
import { deriveDecomposeEdges } from "./edge-facts.js";
import { cutPreflightId } from "./cut-map-machine.js";
import { cutMachineIssue } from "./cut-map-machine-validation.js";

/** Bind source and dependency observations into one self-authenticating machine half. */
export function deriveDecomposeMachine(input: DecomposeOriginRecords): DecomposeResult<CutMapMachine> {
  const source = deriveDecomposeSource(input);
  if (source.status === "refused") return source;
  const edges = deriveDecomposeEdges(input.edges);
  if (new Set(edges.outgoingEdges.map(edge => edge.edgeId)).size !== edges.outgoingEdges.length) {
    return { status: "refused", reason: "outgoing-edge-duplicate", class: "recoverable", locus: "Depends On",
      message: "More than one origin edge has the same provider identity.",
      remedy: { text: "Keep one Depends On edge per provider identity on the origin through write-back, then retry." } };
  }
  const facts = { ...source.result, ...edges };
  const machine = { ...facts, preflightId: cutPreflightId(facts) };
  const issue = cutMachineIssue(machine);
  if (issue !== null) return { status: "refused", reason: issue.code, class: "recoverable", locus: issue.path,
    message: issue.message, remedy: { text: "Repair the origin's source and dependency facts at the locus, then retry." } };
  return { status: "ok", result: machine };
}
