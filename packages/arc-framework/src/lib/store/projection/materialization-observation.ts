/** Observe materialization authority without sweeping unrelated files during a deleted-file restoration. */
import { checkIgnores } from "./ignore-check.js";
import { readReference } from "./change-detection.js";
import { readProjectionConfiguration } from "./configuration.js";
import { sweepAsideFolder, type SweepInput, type SweepResult } from "./sweep.js";
import type { ProjectionMaterializationInput } from "./materialization.js";
import { recoverSubmittedArchiveEdit } from "./read-back-recovery.js";
import { PROJECTED_LIFECYCLE_ROOTS, projectedRootPaths } from "../../layout/index.js";
import { walkProjectionRoots } from "./engine-walk.js";
import { refuseArchiveFolder } from "./archive-selection.js";
import type { RefusedMark } from "./index-schema.js";
import type { ProjectionRootState } from "./process-state.js";

/** Observe the filesystem part of a rebuild and keep unread archive folders opaque until retry. */
export async function observeMaterializationFiles(root: ProjectionRootState) {
  const archiveAccess = new Map<string, RefusedMark>();
  const walked = await walkProjectionRoots(root.checkout, [...PROJECTED_LIFECYCLE_ROOTS,
    ...projectedRootPaths(root.identity).filter(path => path.startsWith(".arc/user/"))], root.ports.walkFs, root.ports.linkFs, archiveAccess);
  for (const [folder, mark] of archiveAccess) refuseArchiveFolder(root, folder, mark);
  return { ...walked, complete: archiveAccess.size === 0 };
}

/** Full materialization sweeps; restoring deleted files only refreshes the ignore proof. */
export async function observeMaterialization(input: ProjectionMaterializationInput): Promise<SweepResult> {
  const { root } = input;
  const sweep: SweepInput = { location: root.location, checkout: root.checkout, index: input.index,
    withheldCopies: input.recovered?.withheldCopies, format: root.context.format, takeIn: root.takeIn, writer: root.context.writer,
    recoverArchiveSubmission: (index, path, entry) => recoverSubmittedArchiveEdit(root, index, path, entry),
    checkpoint: root.context.checkpoint, blockedByLink: root.blockedByLink, ignoreRules: input.configuration.ignoreRules,
    readIgnoreRules: async () => (await readProjectionConfiguration(root.ports.exec, root.checkout)).ignoreRules,
    guard: { root: root.checkout, identity: root.identity, exec: root.ports.execInput, fs: root.ports.fs } };
  if (!input.onlyDeleted) return sweepAsideFolder(sweep);
  const ignores = await checkIgnores({ guard: sweep.guard, records: input.index.ignoreFiles,
    recordedGuard: input.index.ignoreGuard, reference: await readReference(root.checkout), format: sweep.format,
    ignoreRules: sweep.ignoreRules, readIgnoreRules: sweep.readIgnoreRules });
  return { ignores, index: input.index, swept: [], left: [], withheld: [], copies: [] };
}
