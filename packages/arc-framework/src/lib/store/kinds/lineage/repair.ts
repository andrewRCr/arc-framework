/** The only update admitted to an otherwise create-only terminal lineage record. */
import { isDeepStrictEqual } from "node:util";
import { parseLineageRecord } from "./parser.js";
import { HAND_EDIT_VERBS } from "../../links.js";
import type { WriteInput } from "../../write.js";
/** Admit an explicit missing-snapshot repair without changing any other terminal facts. */
export function isTerminalSnapshotRepair(input: WriteInput, before: string | null | undefined): boolean {
  if (input.reference.kind !== "lineage/transition" || input.action !== "put" || input.expected === null || before == null) return false;
  if (input.provenance.verb !== "repair-lineage" && !HAND_EDIT_VERBS.some((verb) => verb === input.provenance.verb)) return false;
  return isMissingTerminalSnapshotRepair(before, input.content);
}
/** Validate the sole content change permitted by a trusted repair writer. */
export function isMissingTerminalSnapshotRepair(before: string, after: string): boolean {
  const prior = parseLineageRecord(before), next = parseLineageRecord(after);
  if (prior === null || next === null || prior.kind === "rename" || next.kind === "rename" || prior.retiredBranches !== undefined || next.retiredBranches === undefined) return false;
  const priorFacts = { ...prior }, nextFacts = { ...next };
  delete priorFacts.retiredBranches; delete nextFacts.retiredBranches;
  return isDeepStrictEqual(priorFacts, nextFacts);
}

/** A final exact-byte comparison rejected a repair before it wrote its target. */
export class LineageRepairVersionConflictError extends Error {
  constructor() { super("The terminal lineage byte generation changed before repair."); this.name = "LineageRepairVersionConflictError"; }
}
