/** Author-slot construction and validation for decomposition preflight. */
import type { CutMapMachine } from "./cut-map-machine.js";
import { CutMapStarterSchema, type CutMapStarter } from "./cut-map-schema.js";
import { cutMachineIssue, cutIdentityArraysMatch } from "./cut-map-machine-validation.js";

/** Parse a starter while preserving all machine identities and their order. */
export function parseCutMapStarter(input: unknown): CutMapStarter | null {
  const parsed = CutMapStarterSchema.safeParse(input);
  if (!parsed.success || cutMachineIssue(parsed.data.machine) !== null
    || !cutIdentityArraysMatch(parsed.data.machine, parsed.data.authoring)) return null;
  return parsed.data;
}

/** Build the starter author slots from one canonical machine envelope. */
export function createCutMapStarter(machine: CutMapMachine): CutMapStarter | null {
  if (cutMachineIssue(machine) !== null) return null;
  const author = { status: "author" } as const;
  return {
    schemaVersion: 4,
    machine,
    authoring: {
      shape: author,
      placement: author,
      destinations: author,
      internalEdges: author,
      externalEdges: author,
      sourceAllocations: machine.sourceUnits.map(({ sourceId }) => ({
        sourceId,
        ownership: author,
        disposition: author,
      })),
      incomingDispositions: machine.incomingEdges.map(({ edgeId }) => ({ edgeId, disposition: author })),
      outgoingDispositions: machine.outgoingEdges.map(({ edgeId }) => ({ edgeId, disposition: author })),
    },
  };
}

