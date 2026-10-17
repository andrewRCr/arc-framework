/** Terminal lineage creation cannot leave its origin's inbound concerns held. */
import { isDeepStrictEqual } from "node:util";
import type { EntryListConfig } from "../../concurrency/entries.js";
import { OwnerIdentitySchema, recordReferences } from "../../identity.js";
import { brokenRule } from "../rule-support.js";
import { observeInboundHeld } from "../work-item/inbound-held.js";
import { isMissingTerminalSnapshotRepair } from "./repair.js";
import { parseLineageRecord } from "./parser.js";
import type { BrokenRule, WriteCheckInput } from "../../write-check.js";
/** Check the proposed origin's inbound list only when creating terminal lineage.
 * @param input - Proposed terminal record and both whole-batch views.
 * @param grammar - Declared inbound entry grammar; absent until the kind declares it.
 * @returns Held-entry or unavailable-evidence violations.
 */
export async function checkLineageRecord(input: WriteCheckInput, grammar?: EntryListConfig): Promise<readonly BrokenRule[]> {
  if (input.next === undefined) {
    const prior = input.prior === undefined ? null : parseLineageRecord(input.prior.content);
    return prior?.retiredBranches === undefined || await archivedBranchAuthority(input, prior.retiredBranches) ? [] : [brokenRule("lineage.retired-branches", "A terminal branch snapshot cannot be removed with its lineage record.",
      "Keep the terminal lineage and its branch authority available for cleanup and retry.")];
  }
  const lineage = parseLineageRecord(input.next.content);
  if (lineage === null) return [];
  const snapshot = await checkRetiredBranches(input, lineage);
  if (snapshot.length !== 0 || grammar === undefined || input.prior !== undefined) return snapshot;
  const owner = OwnerIdentitySchema.parse({ type: "work-item", ...lineage.origin });
  const held = await observeInboundHeld(input.after, owner, grammar);
  const condition = held.status === "unavailable" ? held.condition
    : held.status === "known" && held.value ? "The retiring work item's inbound list still holds an entry." : undefined;
  return condition === undefined ? [] : [brokenRule("lineage.inbound-held", condition,
    "Integrate or route the origin's held inbound entries, repair unavailable observations, and retry retirement.")];
}

async function archivedBranchAuthority(input: WriteCheckInput, branches: unknown): Promise<boolean> {
  if (input.reference.owner.type !== "work-item") return false;
  const source = await input.after.read({ reference: recordReferences["work-item/meta"](input.reference.owner) });
  return source.status === "ok" && source.result.placement?.kind === "completed"
    && isDeepStrictEqual(source.result.links?.branches ?? [], branches);
}

async function checkRetiredBranches(input: WriteCheckInput, lineage: NonNullable<ReturnType<typeof parseLineageRecord>>): Promise<readonly BrokenRule[]> {
  const branches = lineage.retiredBranches;
  const prior = input.prior === undefined ? null : parseLineageRecord(input.prior.content);
  if (input.prior === undefined && branches === undefined) return [];
  const refuse = (condition: string): readonly BrokenRule[] => [brokenRule("lineage.retired-branches", condition,
    "Re-read the retiring primary and create terminal lineage with its exact branch links in the same version-checked retirement batch; then retry.")];
  if (input.reference.owner.type !== "work-item" || input.reference.owner.name !== lineage.origin.name
    || (lineage.origin.uid !== undefined && input.reference.owner.uid !== lineage.origin.uid)) return refuse("The terminal branch snapshot must belong to its exact retiring owner.");
  if (input.prior !== undefined) {
    const trustedRepair = input.writer.kind === "hand-edit" || input.writer.verb === "repair-lineage";
    if (trustedRepair && input.next !== undefined && isMissingTerminalSnapshotRepair(input.prior.content, input.next.content)) return [];
    return isDeepStrictEqual(prior, lineage) ? [] : refuse("A persisted terminal lineage cannot change except to repair its missing branch snapshot.");
  }
  const source = await input.before.read({ reference: recordReferences["work-item/meta"](input.reference.owner) });
  if (source.status === "refused") return refuse(`The retiring primary's branch links cannot be read: ${source.refusal.condition}`);
  return isDeepStrictEqual(source.result.links?.branches ?? [], branches) ? [] : refuse("The terminal branch snapshot differs from the retiring primary's exact branch links.");
}
