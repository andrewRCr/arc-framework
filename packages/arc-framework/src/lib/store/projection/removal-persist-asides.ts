/** Take over recorded recovery copies in swap order while retirement owns the target's lease. */
import type { ProjectionRootState } from "./process-state.js";
import { projectionProcessState } from "./process-state.js";
import type { AsideCopyRecord, RecordEntry, ProjectionIndex, RefusedMark } from "./index-schema.js";
import type { Remedy } from "../refusal.js";
import type { ProjectionPersistHooks } from "./removal-persist.js";
import { observeAsideCopy, settleAsideCopy, type CopySettlement } from "./aside-copies.js";
import { readProjectionLinkBoundary } from "./discovery-links.js";
import { withProjectionEntry } from "./index-memory.js";
import { commitReturnedCopies } from "./returned-copies.js";
import { readProjectionProtection } from "./protection.js";
import { retirementName, retirementRefusal, type ProjectionRetirement } from "./removal-verdict.js";

/** Successful and refused settlement both retain the exact index that was published. */
export interface PersistedProjectionAsides { readonly index: ProjectionIndex; readonly refusal?: Remedy }

interface CopyPersistenceInput {
  readonly root: ProjectionRootState;
  readonly index: ProjectionIndex;
  readonly hooks?: ProjectionPersistHooks;
  readonly ignoreMark?: RefusedMark;
  readonly disposition: ProjectionRetirement;
}

/** Settle even a live writer's copies, publishing returned aliases before cleanup. */
export async function persistProjectionAsides(root: ProjectionRootState, initial: ProjectionIndex, disposition: ProjectionRetirement,
  hooks?: ProjectionPersistHooks, ignoreMark?: RefusedMark): Promise<PersistedProjectionAsides> {
  let index = initial;
  for (const path of Object.keys(index.entries)) {
    const first = index.entries[path];
    if (first?.kind !== "record") continue;
    for (const name of first.copies.map(copy => copy.name)) {
      const settled = await persistCopy({ root, index, hooks, ignoreMark, disposition }, path, name);
      index = settled.index;
      if (settled.refusal !== undefined) return settled;
    }
  }
  return { index };
}

/** Re-observe recorded copies after the last scheduling seam without preparing or sending an edit. */
export async function changedProjectionAsides(root: ProjectionRootState, index: ProjectionIndex): Promise<boolean> {
  for (const [path, entry] of Object.entries(index.entries)) {
    if (entry.kind !== "record") continue;
    for (const copy of entry.copies) {
      const boundary = await readProjectionLinkBoundary(root.checkout, [copy.name], root.ports.linkFs);
      if (boundary(copy.name) !== null) continue;
      const observed = await observeAsideCopy({ checkout: root.checkout, path, entry, copy, format: root.context.format });
      if (observed.kind === "edited" || observed.kind === "unsettled") return true;
    }
  }
  return false;
}

async function persistCopy(input: CopyPersistenceInput, path: string, name: string): Promise<PersistedProjectionAsides> {
  const { root, index } = input;
  await input.hooks?.beforeAsideCopy?.(root.checkout, path, name);
  await root.checkpoint?.();
  const entry = index.entries[path];
  const copy = entry?.kind === "record" ? entry.copies.find(each => each.name === name) : undefined;
  if (entry?.kind !== "record" || copy === undefined) return { index };
  const boundary = await readProjectionLinkBoundary(root.checkout, [path, name], root.ports.linkFs);
  if (boundary(name) !== null) return { index };
  if (boundary(path) !== null || !root.writable(path) || !root.writable(name)) return observeUnauthorizedCopy(input, path, entry, copy);
  const diagnosticFrom = projectionProcessState().diagnostics.length;
  const settled = await settleAsideCopy({ checkout: root.checkout, path, entry, copy, format: root.context.format,
    takeIn: root.takeIn, writer: root.context.writer, checkpoint: root.context.checkpoint });
  const published = await commitReturnedCopies({ checkout: root.checkout, location: root.location, checkpoint: root.context.checkpoint,
    index: withProjectionEntry(index, path, settled.entry),
    returned: settled.kind === "returned" || settled.kind === "linked-back" ? [{ path, copy: name }] : [] });
  return { index: published, refusal: removalCopyRefusal(settled, root.checkout, name, diagnosticFrom, input.disposition) };
}

async function observeUnauthorizedCopy(input: CopyPersistenceInput, path: string,
  entry: RecordEntry, copy: AsideCopyRecord): Promise<PersistedProjectionAsides> {
  const { root, index } = input;
  const observed = await observeAsideCopy({ checkout: root.checkout, path, entry, copy, format: root.context.format });
  if (observed.kind === "no-edit" || observed.kind === "gone") return { index };
  const denied = await readProjectionProtection({ store: root.store, checkout: root.checkout, identity: root.identity,
    exec: root.ports.exec, verb: root.context.verb }, entry.reference);
  if (denied !== null) return { index, refusal: retirementRefusal(root.checkout, copy.name, denied, input.disposition) };
  // The ignore rules hold only a path they leave unwritable, named as the check's guard names it: the file's own path first.
  const unwritable = [path, copy.name].find(each => !root.writable(each));
  return { index, refusal: input.ignoreMark === undefined || unwritable === undefined ? recoverCopy(root.checkout, copy.name, input.disposition)
    : retirementRefusal(root.checkout, unwritable, input.ignoreMark, input.disposition) };
}

/** Preserve the copy's actual blocking outcome and diagnostic across retirement operations. */
export function removalCopyRefusal(settled: CopySettlement, checkout: string, copy: string, diagnosticFrom: number,
  disposition: ProjectionRetirement): Remedy | undefined {
  if (settled.kind === "deleted" || settled.kind === "dropped" || settled.kind === "linked-back") return undefined;
  if (settled.kind === "not-a-file") return settled.remedy;
  if (settled.kind === "moved-on") return recoverCopy(checkout, copy, disposition);
  const mark = projectionProcessState().diagnostics.slice(diagnosticFrom).reverse().find(each => each.copy === copy)?.mark
    ?? settled.entry.refused;
  return mark === null ? { text: `Let ${copy} finish saving, then run arc save from ${checkout} and retry ${retirementName(disposition)}.` }
    : retirementRefusal(checkout, copy, mark, disposition);
}

function recoverCopy(checkout: string, copy: string, disposition: ProjectionRetirement): Remedy {
  return { text: `Recover anything wanted from ${copy} in ${checkout}, then delete that copy explicitly and retry ${retirementName(disposition)}.` };
}
