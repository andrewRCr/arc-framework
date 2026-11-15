/** Release a checkout's projection before its caller clears the claim. */
import type { ProjectionRemovalSlots } from "../../git/worktree-removal.js";
import type { ProjectionPersistContext } from "./removal-persist.js";
import { retireProjectionRoot, withPersistedProjection } from "./removal-persist.js";
import type { ProjectionRootState } from "./process-state.js";
import type { ProjectionIndex, RecordEntry } from "./index-schema.js";
import { readReference, readStat } from "./change-detection.js";
import { createRecordRenderer } from "./record-render.js";
import { guardReplacement, type GuardResult } from "./replace-guard.js";
import { swapBatch, type SwapFile } from "./swap.js";
import { runSecondCheck } from "./second-check.js";
import { readProjectionLinkBoundary, type ProjectionLinkBoundary } from "./discovery-links.js";
import { readdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { PROJECTION_ASIDE_ROOT } from "./paths.js";
import { commitProjectionIndex, PROJECTION_INDEX_FILE } from "./index-file.js";
import { withProjectionEntry } from "./index-memory.js";
import type { ProjectionPersistResult } from "./removal-persist.js";
import { projectionProcessState } from "./process-state.js";
import type { TakeInPort } from "./take-in-port.js";
import type { Remedy } from "../refusal.js";
import { observeAsideCopy } from "./aside-copies.js";
import { removalCopyRefusal } from "./removal-persist-asides.js";
import { checkUnrecordedProjectionCopies } from "./removal-asides.js";
import { findRetainedReleaseEntry, retainedReleaseEntry, unfinishedReleaseRemedy } from "./release-entries.js";
import { releaseAbsentWithheldPaths } from "./withheld.js";

/** Persist the target and remove only a linked checkout's projection. */
export async function releaseProjectionRemoval(checkout: string, _isPrimary: boolean,
  context: ProjectionPersistContext): Promise<Awaited<ReturnType<ProjectionRemovalSlots["release"]>>> {
  const removal: ReleaseRemoval = { removed: false, reported: false };
  const result = await withPersistedProjection(checkout, context, "release", async (root, index, ignoreRefusal) => {
    if (root.location.primary) return { kind: "persisted" };
    return removeLinkedProjection(root, index, removal, ignoreRefusal);
  });
  if (result.kind === "persisted") return { kind: "released" };
  // A refusal release's own steps did not compose, such as a lost lease, still says the swap removed files.
  return removal.removed && !removal.reported ? { ...result, remedy: removedFilesRemedy(checkout, result.remedy) } : result;
}

/** Whether release's removal swap began, and whether a refusal already said so. */
interface ReleaseRemoval { removed: boolean; reported: boolean }

async function removeLinkedProjection(root: ProjectionRootState, initial: ProjectionIndex, removal: ReleaseRemoval,
  ignoreRefusal?: Remedy): Promise<ProjectionPersistResult> {
  // Nothing of an absent withheld entry remains on disk, so release discards it wherever the ignore check passes, as its
  // removal check predicts, including under another identity's root that persist leaves alone.
  const releasable = (path: string): boolean => ignoreRefusal === undefined || root.writable(path);
  const index = await releaseAbsentWithheldPaths({ checkout: root.checkout, writable: releasable }, initial, Object.keys(initial.entries));
  const retained = await retainedReleaseRefusal(root, index, ignoreRefusal, releasable);
  if (retained !== undefined) return { kind: "refused", remedy: retained };
  const observed = observeRemovalSends(root);
  const guarded = await guardReleasedFiles(root, index, observed);
  if (guarded.refusal !== undefined) return { kind: "refused", remedy: guarded.refusal };
  // The swap removes files the view still lays, so every index it and the second check publish carries no state version:
  // the next command's rebuild lays the files again even where release stops before it can write once more.
  removal.removed = guarded.files.length > 0;
  const batch = await swapBatch({ checkout: root.checkout, location: root.location, index: { ...guarded.index, state: null },
    files: guarded.files, readBack: false, format: root.context.format, writer: root.context.writer, takeIn: observed.takeIn,
    checkpoint: root.context.checkpoint, hooks: root.ports.hooks });
  const latest = { index: batch.index };
  try {
    return await finishLinkedRemoval(root, batch, observed, latest, removal);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return refusedAfterRemoval(root, removal, latest.index, {
      text: `Cannot persist the projection at ${root.checkout}: ${message}. Repair it and retry release.` });
  }
}

/** The second check and the takeover checks after the removal swap, each refusal there clearing the state version. */
async function finishLinkedRemoval(root: ProjectionRootState, batch: Awaited<ReturnType<typeof swapBatch>>,
  observed: ReturnType<typeof observeRemovalSends>, latest: { index: ProjectionIndex }, removal: ReleaseRemoval): Promise<ProjectionPersistResult> {
  const firstRefusal = observed.refusal();
  if (firstRefusal !== undefined) return refusedAfterRemoval(root, removal, batch.index, firstRefusal);
  const currentLinks = await readProjectionLinkBoundary(root.checkout,
    [...batch.removals, ...batch.copies.flatMap(copy => [copy.path, copy.copy])], root.ports.linkFs);
  const diagnosticFrom = projectionProcessState().diagnostics.length;
  const checked = await runSecondCheck({ checkout: root.checkout, location: root.location, index: batch.index,
    copies: batch.copies.filter(copy => currentLinks(copy.copy) === null),
    removals: batch.removals, blockedByLink: currentLinks, format: root.context.format, writer: root.context.writer,
    takeIn: observed.takeIn, checkpoint: root.context.checkpoint });
  latest.index = checked.index;
  const secondRefusal = observed.refusal();
  if (secondRefusal !== undefined) return refusedAfterRemoval(root, removal, checked.index, secondRefusal);
  for (const copy of checked.settled) {
    // An opaque destination still permits discarding a copy proven unchanged below.
    if (currentLinks(copy.path) !== null && copy.settlement.kind === "not-a-file") continue;
    const remedy = removalCopyRefusal(copy.settlement, root.checkout, copy.copy, diagnosticFrom, "release");
    if (remedy !== undefined) return refusedAfterRemoval(root, removal, checked.index, remedy);
  }
  const incomplete = await incompleteRemoval(root, checked.index);
  if (incomplete !== undefined) return refusedAfterRemoval(root, removal, checked.index, incomplete);
  const unrecorded = await checkUnrecordedProjectionCopies({ checkout: root.checkout, index: checked.index,
    format: root.context.format, linkFs: root.ports.linkFs, walkFs: root.ports.walkFs, disposition: "release" });
  if (unrecorded.kind === "would-refuse") return refusedAfterRemoval(root, removal, checked.index, unrecorded.remedy);
  await discardReleasedState(root);
  retireProjectionRoot(root);
  return { kind: "persisted" };
}

/** Release removed files from a checkout it still claims: with no state version, the next command's rebuild lays them. */
async function refusedAfterRemoval(root: ProjectionRootState, removal: ReleaseRemoval, index: ProjectionIndex,
  remedy: Remedy): Promise<ProjectionPersistResult> {
  await commitProjectionIndex({ checkout: root.checkout, location: root.location, index: { ...index, state: null },
    checkpoint: root.context.checkpoint });
  removal.reported = true;
  return { kind: "refused", remedy: removedFilesRemedy(root.checkout, remedy) };
}

function removedFilesRemedy(checkout: string, remedy: Remedy): Remedy {
  return { ...remedy, text: `${remedy.text} Release already removed projected files from ${checkout}; the next arc command there lays them again.` };
}

/** Guard each recorded file's removal, stopping at the first one release cannot take over. */
async function guardReleasedFiles(root: ProjectionRootState, initial: ProjectionIndex, observed: ReturnType<typeof observeRemovalSends>): Promise<{
  index: ProjectionIndex; files: SwapFile[]; refusal?: Remedy;
}> {
  let index = initial;
  const blocked = await readProjectionLinkBoundary(root.checkout, Object.keys(index.entries), root.ports.linkFs);
  const files: SwapFile[] = [];
  for (const [path, entry] of Object.entries(initial.entries)) {
    if (entry.kind !== "record" || blocked(path) !== null) continue;
    const replace = await guardReplacement({ checkout: root.checkout, path, entry, staged: null,
      reference: await readReference(root.checkout), format: root.context.format, store: root.store,
      writer: root.context.writer, takeIn: observed.takeIn, checkpoint: root.context.checkpoint,
      renderer: createRecordRenderer({ store: root.store, memo: root.context.memo }) });
    index = withProjectionEntry(index, path, replace.entry);
    if (replace.kind !== "replace") {
      await commitProjectionIndex({ checkout: root.checkout, location: root.location, index, checkpoint: root.context.checkpoint });
      return { index, files, refusal: observed.refusal() ?? guardRefusal(root, path, replace) };
    }
    files.push({ path, replace });
  }
  return { index, files };
}

/** An entry whose file is gone that persist left in place: release cannot discard it, as its removal check predicts. */
async function retainedReleaseRefusal(root: ProjectionRootState, index: ProjectionIndex, ignoreRefusal: Remedy | undefined,
  writable: (path: string) => boolean): Promise<Remedy | undefined> {
  const basis = { checkout: root.checkout, verb: root.context.verb, writable, ignoreRefusal };
  const retained = await findRetainedReleaseEntry(index, root.checkout, root.ports.linkFs, (path, entry) => {
    const remedy = retainedReleaseEntry(basis, path, entry);
    return Promise.resolve(remedy === undefined ? { kind: "passes" } : { kind: "would-refuse", remedy });
  });
  return retained.kind === "would-refuse" ? retained.remedy : undefined;
}

function guardRefusal(root: ProjectionRootState, path: string, held: Extract<GuardResult, { kind: "unreplaced" }>): Remedy {
  if ("remedy" in held) return held.remedy;
  if ("refusal" in held) return held.refusal.remedy;
  return held.entry.refused?.remedy ?? { text: `Run arc save from ${root.checkout} to finish ${path}, then retry release.` };
}

async function discardReleasedState(root: ProjectionRootState): Promise<void> {
  const links = await readProjectionLinkBoundary(root.checkout, [PROJECTION_ASIDE_ROOT], root.ports.linkFs);
  if (links(PROJECTION_ASIDE_ROOT) === null) {
    await root.context.checkpoint?.();
    await rm(join(root.checkout, PROJECTION_ASIDE_ROOT), { recursive: true, force: true });
  }
  for (const name of await readdir(root.location.stateDir)) {
    if (!/^index-[a-f0-9]{40}$/u.test(name)) continue;
    await root.context.checkpoint?.();
    await rm(join(root.location.stateDir, name), { force: true });
  }
  await root.context.checkpoint?.();
  await rm(join(root.location.stateDir, PROJECTION_INDEX_FILE), { force: true });
}

async function incompleteRemoval(root: ProjectionRootState, index: ProjectionIndex): Promise<Remedy | undefined> {
  const names = Object.entries(index.entries).flatMap(([path, entry]) => [path,
    ...(entry.kind === "record" ? entry.copies.map(copy => copy.name) : [])]);
  const links = await readProjectionLinkBoundary(root.checkout, names, root.ports.linkFs);
  for (const [path, entry] of Object.entries(index.entries)) {
    const held = entry.kind === "record" ? await remainingCopies(root, path, entry, links) : undefined;
    if (held !== undefined) return held;
    if (links(path) !== null) continue;
    if (entry.kind !== "record" || await readStat(join(root.checkout, path)) !== null) {
      return entry.kind === "record" && entry.refused !== null ? entry.refused.remedy : unfinishedReleaseRemedy(root.checkout, path);
    }
  }
  return undefined;
}

async function remainingCopies(root: ProjectionRootState, path: string, entry: RecordEntry,
  links: ProjectionLinkBoundary): Promise<Remedy | undefined> {
  for (const copy of entry.copies) {
    if (links(copy.name) !== null) continue;
    // Persist leaves a copy it may not take over recorded; one holding no edit goes with the aside folder.
    if (links(path) !== null || !root.writable(path) || !root.writable(copy.name)) {
      const observed = await observeAsideCopy({ checkout: root.checkout, path, entry, copy, format: root.context.format });
      if (observed.kind === "no-edit" || observed.kind === "gone") continue;
    }
    return { text: `Recover anything wanted from ${copy.name} in ${root.checkout}, then delete that copy explicitly and retry release.` };
  }
  return undefined;
}

function observeRemovalSends(root: ProjectionRootState): { takeIn: TakeInPort; refusal: () => Remedy | undefined } {
  let refusal: Remedy | undefined;
  return { refusal: () => refusal, takeIn: async request => {
    const diagnosticFrom = projectionProcessState().diagnostics.length;
    const result = await root.takeIn(request);
    if (result.answer !== "no-edit" && result.answer !== "taken-in") {
      const mark = projectionProcessState().diagnostics.slice(diagnosticFrom).reverse().find(each =>
        each.path === request.path && each.copy === request.copy)?.mark;
      refusal ??= mark?.remedy ?? ("mark" in result ? result.mark.remedy : result.entry.refused?.remedy)
        ?? { text: `The edit at ${request.copy ?? request.path} remains ${result.answer}. Run arc save from ${root.checkout}, then retry release.` };
    }
    return result;
  } };
}
