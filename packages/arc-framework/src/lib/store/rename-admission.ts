/** Admit a rename's batch only where preparing it again over the state it lands on yields the same batch. */
import { canonicalize } from "../kernel/canonical/canonical-json.js";
import { sameReference } from "./identity.js";
import { recordWritePlacement } from "./lifecycle-write.js";
import { planStoreRename, type RenameBranchInput, type RenamePlanView } from "./lifecycle-rename.js";
import { prepareCohortRenameBatch } from "./cohort-rename.js";
import type { BranchLink } from "./links.js";
import type { StoreRecord } from "./read.js";
import type { StoreResult } from "./refusal.js";
import type { Mutation, RecordObservation } from "./write.js";
import type { BrokenRule, WriteCheckInput } from "./write-check.js";

/** The rule every rename batch answers to at admission. */
export const RENAME_PREPARATION_RULE = "rename.preparation";

interface FreshRename { records: readonly StoreRecord[]; writes: readonly Mutation[]; observations?: readonly RecordObservation[] }

/** Re-run the rename's preparation over the before view, once per batch on its primary, and compare the batch to it.
 * @param input - A write in a rename batch.
 * @returns No rules for any write but the renamed primary; otherwise the fresh preparation's refusal or disagreement.
 */
export async function checkPreparedRename(input: WriteCheckInput): Promise<readonly BrokenRule[]> {
  if (input.writer.kind !== "verb" || input.writer.verb !== "rename" || input.prior === undefined || input.next === undefined) return [];
  if (input.reference.kind !== "work-item/meta" && input.reference.kind !== "cohort/document") return [];
  const prior = await input.before.read({ reference: input.reference }), next = await input.after.read({ reference: input.reference });
  if (prior.status !== "ok" || next.status !== "ok") return [refusal(input.reference.owner, "Rename identity evidence is unavailable.")];
  const primary = prior.result, target = next.result.reference.owner.name;
  if (primary.reference.owner.name === target) return [];
  const fail = (condition: string): readonly BrokenRule[] => [refusal(primary.reference.owner, condition, target)];
  const view: RenamePlanView = { read: request => input.before.read(request), list: request => input.before.list(request),
    lookup: request => input.before.lookup(request), history: request => input.before.history(request),
    capabilities: { stateOffBranch: true } };
  let fresh: StoreResult<FreshRename>;
  try {
    fresh = primary.reference.kind === "cohort/document" ? await prepareCohortRenameBatch(view, primary, target)
      : await planStoreRename(view, { primary, operand: uid(primary.reference.owner) ?? primary.reference.owner.name, target,
        ...movedBranch(primary, next.result) });
  } catch (error) {
    return fail(error instanceof Error ? error.message : String(error));
  }
  if (fresh.status === "refused") return fail(fresh.refusal.condition);
  if (await differsFromBatch(input, fresh.result)) return fail("The rename's batch differs from preparing it again over the current records.");
  return observesEvidence(input, fresh.result) ? [] : fail("The rename's batch does not observe every record its preparation now reads.");
}

/** Each present record the fresh preparation read is observed by the batch or written by it at an expected version.
 * An absence needs no observation here: fresh preparation read it absent in this same state, and refuses on its own when
 * the record is present.
 */
function observesEvidence(input: WriteCheckInput, fresh: FreshRename): boolean {
  return (fresh.observations ?? []).every(item => item.expected === null
    || fresh.writes.some(write => sameReference(write.reference, item.reference))
    || input.observations.some(other => sameReference(other.reference, item.reference)));
}

/** Every acquired record lands as the fresh preparation writes it, or unchanged when it writes nothing. */
async function differsFromBatch(input: WriteCheckInput, fresh: FreshRename): Promise<boolean> {
  for (const record of fresh.records) {
    const write = fresh.writes.find(item => sameReference(item.reference, record.reference));
    const landed = await input.after.read({ reference: write?.reference ?? record.reference });
    if (landed.status !== "ok") return true;
    if (write === undefined) { if (landed.result.version !== record.version) return true; continue; }
    if (write.action !== "put" || landed.result.reference.owner.name !== write.reference.owner.name || landed.result.content !== write.content) return true;
    if (write.placement !== undefined && canonicalize(recordWritePlacement(landed.result) ?? null) !== canonicalize(write.placement)) return true;
    if (canonicalize(landed.result.links ?? null) !== canonicalize(write.links ?? record.links ?? null)) return true;
  }
  return false;
}

/** The batch's one branch-link move asserts that this machine's checkout holds the subject's branch. */
function movedBranch(prior: StoreRecord, next: StoreRecord): { branch?: RenameBranchInput } {
  const key = (link: BranchLink): string => JSON.stringify([link.repository, link.ref]);
  const before = prior.links?.branches ?? [], after = next.links?.branches ?? [];
  const removed = before.filter(link => !after.some(other => key(other) === key(link)));
  const added = after.filter(link => !before.some(other => key(other) === key(link)));
  const [from] = removed, [to] = added;
  return removed.length === 1 && added.length === 1 && from !== undefined && to !== undefined
    ? { branch: { prior: from, next: to, checkoutHere: true } } : {};
}

function uid(owner: StoreRecord["reference"]["owner"]): string | undefined {
  return owner.type === "person" ? undefined : owner.uid;
}

function refusal(owner: StoreRecord["reference"]["owner"], condition: string, target?: string): BrokenRule {
  const subject = uid(owner) ?? owner.name;
  return { rule: RENAME_PREPARATION_RULE, condition, remedy: {
    text: "Prepare the rename again from the current records and retry; no rename mutations were published.",
    ...(target === undefined ? {} : { argv: ["arc", "rename", subject, target] }) } };
}
