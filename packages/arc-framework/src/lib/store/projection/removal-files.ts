/** Read changed projected files through ordinary admission without submitting their writes. */
import { join } from "node:path";
import { PROJECTED_PERSONAL_ROOT } from "../../layout/index.js";
import { readProjectionFolder } from "./engine-walk.js";
import { checkChange, projectionFileReader, readReference, readStat } from "./change-detection.js";
import type { ProjectionEnginePorts } from "./engine-ports.js";
import { withheldProjectionMark } from "./materialization-file.js";
import { unfinishedRecordingRefusal } from "./recording-state.js";
import { markedRemovalRefusal, projectionFeasibilityRefusal, retirementName, unobservedMarkDetail, type ProjectionRemovalCheck,
  type ProjectionRetirement } from "./removal-verdict.js";
import { checkProjectionAdoption } from "./removal-adoption.js";
import { checkPendingProjectionReadBack, observeRetirementInventory, type ProjectionRemovalGuard,
  type ProjectionRemovalObservationInput } from "./removal-observations.js";
import { readProjectionLinkBoundary } from "./discovery-links.js";
import { readProjectionProtection } from "./protection.js";
import type { ReadOnlyProjectionRoot } from "./engine-read-only.js";
import type { ProjectionIndex, RecordEntry } from "./index-schema.js";
import { recordWriteBackSent } from "./aside-copies.js";
import { withProjectionEntry } from "./index-memory.js";
import { readPendingProjectionInput } from "./unchanged-file.js";
import type { TakeInRequest } from "./take-in-port.js";
import { pendingFileRequest } from "./pending-request.js";
import { inspectArchivedProjectionFile } from "./archive-inspection.js";
import { ArchiveDestinationBlocked } from "./archive-file.js";
import { firstUnreadArchiveScope, retirementSelection, selectArchivePath } from "./archive-selection.js";
import { releasesAbsentWithheld } from "./withheld.js";
import type { ArchiveDiscoveryRoot } from "./archive-discovery.js";

/** Discovery roots and the check's one guard join the shared target-local observation inputs. */
export interface ProjectionRemovalFilesInput extends ProjectionRemovalObservationInput {
  readonly roots: readonly string[];
  readonly guard: ProjectionRemovalGuard;
}

/** Hypothetical send marks travel to the subsequent copy check, while the published index stays untouched. */
export interface ProjectionRemovalFilesResult { readonly verdict: ProjectionRemovalCheck; readonly index: ProjectionIndex }

/** Inspect authored changes without following links or relying on old refused marks. */
export async function checkProjectionRemovalFiles(input: ProjectionRemovalFilesInput): Promise<ProjectionRemovalFilesResult> {
  const { root, index, roots, ports } = input;
  let preparedIndex = index;
  const observingRoot: ReadOnlyProjectionRoot = { ...root, takeIn: async request => {
    const prepared = await root.takeIn(request);
    if (prepared.kind === "ready") preparedIndex = withProjectionEntry(preparedIndex, request.path, recordWriteBackSent(request.entry, null));
    return prepared;
  } };
  const selected = await readRemovalProjectionRoots(root.checkout, roots, ports);
  const coverage: ArchiveDiscoveryRoot = { ...root, ports };
  const walked = await observeRetirementInventory(coverage, index, selected);
  const unread = firstUnreadArchiveScope(coverage);
  if (unread !== undefined) return { index, verdict: { kind: "unobservable", detail: unobservedMarkDetail(root.checkout, unread[0], unread[1]) } };
  const opaque = walked.opaque?.entries().next().value;
  if (opaque !== undefined) return { index, verdict: markedRemovalRefusal(root.checkout, opaque[0], opaque[1], input.disposition) };
  const reference = await readReference(root.checkout);
  const retries = Object.keys(index.entries).filter(path => {
    const entry = index.entries[path];
    return entry?.kind === "record" && entry.adoption !== undefined || entry?.kind === "ownerless" && entry.minted !== undefined;
  });
  const boundary = await readProjectionLinkBoundary(root.checkout, retries, ports.linkFs);
  const { guard } = input;
  for (const path of retirementSelection(index, [...walked.files, ...retries])) {
    // An archive path this checkout does not own is left untouched and leaves retirement unjudged.
    const refused = selectArchivePath(root, path, { report: false });
    if (refused !== null) return { index: preparedIndex, verdict: { kind: "unobservable", detail: unobservedMarkDetail(root.checkout, path, refused) } };
    if (!path.startsWith(".arc/completed/") && boundary(path) !== null) continue;
    const checked = await checkRemovalFileAtPath({ ...input, root: observingRoot, index: preparedIndex }, path, reference, guard);
    if (checked.kind !== "passes") return { verdict: checked, index: preparedIndex };
  }
  return { verdict: { kind: "passes" }, index: preparedIndex };
}

async function checkRemovalFileAtPath(input: ProjectionRemovalFilesInput, path: string,
  reference: bigint | null, guard: ProjectionRemovalGuard): Promise<ProjectionRemovalCheck> {
  const { checkout } = input.root;
  try {
    return await observeRemovalFile(input, path, reference, guard);
  } catch (error) {
    if (error instanceof ArchiveDestinationBlocked) return { kind: "unobservable", detail: unobservedMarkDetail(checkout, path, error.mark) };
    throw error;
  }
}

async function observeRemovalFile(input: ProjectionRemovalFilesInput, path: string,
  reference: bigint | null, guard: ProjectionRemovalGuard): Promise<ProjectionRemovalCheck> {
  const { root, index } = input;
  const entry = index.entries[path];
  if (entry?.withheld) {
    // Persist and release discard a withheld entry whose file is gone, so nothing of it is left to lose; the ignore check
    // they run answers for the paths they may write.
    if (releasesAbsentWithheld(() => true, path, entry) && await readStat(join(root.checkout, path)) === null) return { kind: "passes" };
    return markedRemovalRefusal(root.checkout, path, entry.refused
      ?? withheldProjectionMark(path, { checkout: root.checkout, known: entry.kind === "record" }), input.disposition);
  }
  const archive = await inspectArchivedProjectionFile(root, index, path, { reference });
  if (archive !== null) return archive.kind === "unobservable"
    ? { kind: "unobservable", detail: unobservedMarkDetail(root.checkout, path, archive.mark) }
    : markedRemovalRefusal(root.checkout, path, archive.mark, input.disposition);
  if (entry?.kind !== "record") return checkProjectionAdoption(root, index, path, guard, input.disposition);
  return checkRecordRemoval(input, path, entry, reference, guard);
}

async function checkRecordRemoval(input: ProjectionRemovalFilesInput, path: string, entry: RecordEntry,
  reference: bigint | null, guard: ProjectionRemovalGuard): Promise<ProjectionRemovalCheck> {
  const { root } = input;
  const recording = unfinishedRecordingRefusal(entry);
  if ((recording !== null || entry.adoption?.kind === "read-back")
    && entry.reference.owner.type === "person" && entry.reference.owner.name !== root.identity) {
    const denied = await readProjectionProtection({ store: root.store, checkout: root.checkout, identity: root.identity,
      exec: root.ports.exec, verb: root.context.verb }, entry.reference);
    if (denied !== null) return markedRemovalRefusal(root.checkout, path, denied, input.disposition);
  }
  if (recording !== null) return checkUnfinishedRecording(root, path, guard, input.disposition);
  if (entry.adoption?.kind === "read-back") return checkPendingProjectionReadBack(input, path, guard);
  // Persistence resends an attached adoption's observed file whatever its stat records, so the check predicts that send.
  if (entry.adoption?.kind === "write-back") return checkRemovalSend(root, pendingFileRequest(root.checkout, path, entry), guard, input.disposition);
  return checkIndexedRemovalEdit(root, path, entry, reference, guard, input.disposition);
}

/** Persist finishes the recording where the ignore check lets it install, so the hold names the guard's remedy or that save. */
async function checkUnfinishedRecording(root: ReadOnlyProjectionRoot, path: string, guard: ProjectionRemovalGuard,
  disposition: ProjectionRetirement): Promise<ProjectionRemovalCheck> {
  const guarded = await guard(path);
  if (guarded.kind !== "passes") return guarded;
  return { kind: "would-refuse", remedy: { text: `Run arc save from ${root.checkout} to finish recording the accepted input at ${path}, then retry ${retirementName(disposition)}.` } };
}

async function checkIndexedRemovalEdit(root: ReadOnlyProjectionRoot, path: string, entry: RecordEntry,
  reference: bigint | null, guard: ProjectionRemovalGuard, disposition: ProjectionRetirement): Promise<ProjectionRemovalCheck> {
  const reader = projectionFileReader(root.checkout, path);
  const changed = await checkChange({ path: join(root.checkout, path), recorded: entry.stat,
    written: entry.written, reference, format: root.context.format }, reader.read, reader.stat);
  if (changed.status === "absent") return { kind: "passes" };
  const conflict = entry.markers !== null || entry.notices.length > 0 || entry.unshown.length > 0;
  if (changed.status !== "changed" && !conflict) return { kind: "passes" };
  const request = pendingFileRequest(root.checkout, path, entry);
  const input = await readPendingProjectionInput(root.context, request);
  if (input?.kind === "unchanged") return { kind: "passes" };
  if (input?.kind === "inaccessible") return { kind: "unobservable", detail: unobservedMarkDetail(root.checkout, path, input.mark) };
  if (input?.kind === "retained") {
    const guarded = await guard(path);
    return guarded.kind === "passes" ? markedRemovalRefusal(root.checkout, path, input.mark, disposition) : guarded;
  }
  return checkRemovalSend(root, request, guard, disposition);
}

/** Predict persistence's send: a file it would send at all must also be one it could install. */
async function checkRemovalSend(root: ReadOnlyProjectionRoot, request: TakeInRequest,
  guard: ProjectionRemovalGuard, disposition: ProjectionRetirement): Promise<ProjectionRemovalCheck> {
  const prepared = await root.takeIn(request);
  if (prepared.kind === "held" && prepared.result.answer === "no-edit") return { kind: "passes" };
  const refused = projectionFeasibilityRefusal(prepared, root.checkout, request.path, disposition, request.entry);
  if (refused?.kind === "unobservable") return refused;
  const guarded = await guard(request.path);
  return guarded.kind === "passes" ? refused ?? guarded : guarded;
}

/** Include every identity's remaining personal tree, without following identity-directory links. */
export async function readRemovalProjectionRoots(checkout: string, roots: readonly string[],
  ports: Pick<ProjectionEnginePorts, "walkFs" | "linkFs"> = {}): Promise<readonly string[]> {
  const boundary = await readProjectionLinkBoundary(checkout, [PROJECTED_PERSONAL_ROOT], ports.linkFs);
  if (boundary(PROJECTED_PERSONAL_ROOT) !== null) return roots;
  const entries = readProjectionFolder(join(checkout, PROJECTED_PERSONAL_ROOT), ports.walkFs);
  if (entries === null) return roots;
  return [...new Set([...roots, ...entries.filter(entry => entry.isDirectory()).map(entry => `${PROJECTED_PERSONAL_ROOT}/${entry.name}`)])];
}
