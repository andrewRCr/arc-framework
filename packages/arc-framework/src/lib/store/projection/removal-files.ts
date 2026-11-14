/** Read changed projected files through ordinary admission without submitting their writes. */
import { join } from "node:path";
import { PROJECTED_PERSONAL_ROOT } from "../../layout/index.js";
import { readProjectionFolder, walkProjectionRoots } from "./engine-walk.js";
import { checkChange, readReference } from "./change-detection.js";
import type { ProjectionEnginePorts } from "./engine-ports.js";
import { withheldProjectionMark } from "./materialization-file.js";
import { unfinishedRecordingRefusal } from "./recording-state.js";
import { projectionFeasibilityRefusal, type ProjectionRemovalCheck } from "./removal-verdict.js";
import { checkProjectionAdoption } from "./removal-adoption.js";
import { checkPendingProjectionReadBack, type ProjectionRemovalGuard,
  type ProjectionRemovalObservationInput } from "./removal-observations.js";
import { readProjectionLinkBoundary } from "./discovery-links.js";
import { readProjectionProtection } from "./protection.js";
import type { ReadOnlyProjectionRoot } from "./engine-read-only.js";
import type { ProjectionIndex, RecordEntry } from "./index-schema.js";
import { recordWriteBackSent } from "./aside-copies.js";
import { withProjectionEntry } from "./index-memory.js";
import { readUnchangedProjectionFile } from "./unchanged-file.js";
import type { TakeInRequest } from "./take-in-port.js";
import { pendingFileRequest } from "./pending-request.js";

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
  const walked = await walkProjectionRoots(root.checkout, selected, ports.walkFs, ports.linkFs);
  const reference = await readReference(root.checkout);
  const retries = Object.keys(index.entries).filter(path => {
    const entry = index.entries[path];
    return entry?.kind === "record" && entry.adoption !== undefined
      || entry?.kind === "ownerless" && entry.minted !== undefined;
  });
  const boundary = await readProjectionLinkBoundary(root.checkout, retries, ports.linkFs);
  const { guard } = input;
  for (const path of new Set([...walked.files, ...retries])) {
    if (boundary(path) !== null) continue;
    const checked = await checkRemovalFileAtPath({ ...input, root: observingRoot, index: preparedIndex }, path, reference, guard);
    if (checked.kind !== "passes") return { verdict: checked, index: preparedIndex };
  }
  return { verdict: { kind: "passes" }, index: preparedIndex };
}

async function checkRemovalFileAtPath(input: ProjectionRemovalFilesInput, path: string,
  reference: bigint | null, guard: ProjectionRemovalGuard): Promise<ProjectionRemovalCheck> {
  const { root, index } = input;
  const entry = index.entries[path];
  if (entry?.withheld) return { kind: "would-refuse", remedy: entry.refused?.remedy ?? withheldProjectionMark().remedy };
  if (entry?.kind !== "record") return checkProjectionAdoption(root, index, path, guard);
  const recording = unfinishedRecordingRefusal(entry);
  if ((recording !== null || entry.adoption?.kind === "read-back")
    && entry.reference.owner.type === "person" && entry.reference.owner.name !== root.identity) {
    const denied = await readProjectionProtection({ store: root.store, checkout: root.checkout, identity: root.identity,
      exec: root.ports.exec, verb: root.context.verb }, entry.reference);
    if (denied !== null) return { kind: "would-refuse", remedy: denied.remedy };
  }
  if (recording !== null) return { kind: "would-refuse", remedy: recording.remedy };
  if (entry.adoption?.kind === "read-back") return checkPendingProjectionReadBack(input, path, guard);
  // Persistence resends an attached adoption's observed file whatever its stat records, so the check predicts that send.
  if (entry.adoption?.kind === "write-back") return checkRemovalSend(root, pendingFileRequest(root.checkout, path, entry), guard);
  return checkIndexedRemovalEdit(root, path, entry, reference, guard);
}

async function checkIndexedRemovalEdit(root: ReadOnlyProjectionRoot, path: string, entry: RecordEntry,
  reference: bigint | null, guard: ProjectionRemovalGuard): Promise<ProjectionRemovalCheck> {
  const changed = await checkChange({ path: join(root.checkout, path), recorded: entry.stat,
    written: entry.written, reference, format: root.context.format });
  if (changed.status === "absent") return { kind: "passes" };
  const conflict = entry.markers !== null || entry.notices.length > 0 || entry.unshown.length > 0;
  if (changed.status !== "changed" && !conflict) return { kind: "passes" };
  const request = pendingFileRequest(root.checkout, path, entry);
  if (await readUnchangedProjectionFile(root.context, request) !== null) return { kind: "passes" };
  return checkRemovalSend(root, request, guard);
}

/** Predict persistence's send: a file it would send at all must also be one it could install. */
async function checkRemovalSend(root: ReadOnlyProjectionRoot, request: TakeInRequest,
  guard: ProjectionRemovalGuard): Promise<ProjectionRemovalCheck> {
  const prepared = await root.takeIn(request);
  if (prepared.kind === "held" && prepared.result.answer === "no-edit") return { kind: "passes" };
  const refused = projectionFeasibilityRefusal(prepared, request.path);
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
