/** Refresh a root under a lease another checkout's command holds, leaving publication to that command. */
import { needsProjectionReprojection } from "./settings.js";
import { readProjectionConfiguration, type ProjectionConfiguration } from "./configuration.js";
import { readReference } from "./change-detection.js";
import { checkIgnores } from "./ignore-check.js";
import { recordProjectionIgnoreCheck } from "./ignore-record.js";
import { guardedProjectionRoots } from "./ignore-guard.js";
import { writableUnder } from "./sweep.js";
import { loadProjectionGroups } from "./index-memory.js";
import type { ProjectionProtectionEvidence } from "./protection-evidence.js";
import type { ProjectionSource } from "./record-source.js";
import type { ProjectionIndex } from "./index-schema.js";
import type { ProjectionRootState } from "./process-state.js";
import type { StateVersion } from "../identity.js";

/** The held root and index, the state to reach, and where an ignore refusal is reported. */
export interface HeldProjectionRefresh {
  readonly root: ProjectionRootState;
  readonly source: ProjectionSource;
  readonly version: StateVersion;
  readonly index: ProjectionIndex;
  readonly configuration: ProjectionConfiguration;
  readonly evidence?: ProjectionProtectionEvidence;
  readonly refused: (reason: string, remedy: string) => void;
}

/** Check the root's ignore rules, then reproject and refresh its held index to the version for the caller to commit. */
export async function refreshHeldProjectionRoot(input: HeldProjectionRefresh): Promise<ProjectionIndex> {
  const { root, source, version, evidence } = input;
  const ignores = await checkIgnores({ guard: { root: root.checkout, identity: root.identity,
    exec: root.ports.execInput, fs: root.ports.fs }, records: input.index.ignoreFiles, reference: await readReference(root.checkout),
    format: root.context.format, ignoreRules: input.configuration.ignoreRules, recordedGuard: input.index.ignoreGuard,
    readIgnoreRules: async () => (await readProjectionConfiguration(root.ports.exec, root.checkout)).ignoreRules });
  let index = recordProjectionIgnoreCheck(input.index, ignores);
  root.writable = writableUnder(ignores, guardedProjectionRoots(root.identity).map(each => each.path));
  if (ignores.kind === "refused") input.refused(ignores.reason, ignores.remedy);
  loadProjectionGroups(index, "walked");
  if (needsProjectionReprojection(root, index)) index = await root.reproject?.({ source, version, index, evidence }) ?? index;
  return await root.refresh?.({ source, version, index, evidence, publication: "caller" }) ?? index;
}
