/** Read target-local filesystem authority for recovery that retirement itself must never perform. */
import type { ReadOnlyProjectionRoot } from "./engine-read-only.js";
import type { ProjectionIndex } from "./index-schema.js";
import type { ProjectionEnginePorts } from "./engine-ports.js";
import type { ProjectionConfiguration } from "./configuration.js";
import type { ProjectionRemovalCheck } from "./removal-verdict.js";
import { readProjectionConfiguration } from "./configuration.js";
import { checkIgnores, type IgnoreCheck } from "./ignore-check.js";
import { guardedProjectionRoots } from "./ignore-guard.js";
import { readReference } from "./change-detection.js";
import { writableUnder } from "./sweep.js";
import { observeProjectionHandoffs } from "./ownership-handoff.js";

/** A read binding plus the exact index and configuration being checked. */
export interface ProjectionRemovalObservationInput {
  readonly root: ReadOnlyProjectionRoot;
  readonly index: ProjectionIndex;
  readonly configuration: ProjectionConfiguration;
  readonly ports: Pick<ProjectionEnginePorts, "exec" | "execInput" | "fs" | "walkFs" | "linkFs">;
}

/** Read the ordinary ignore proof without sweeping, recording, or publishing its observations. */
export function readRemovalIgnoreCheck(input: ProjectionRemovalObservationInput): Promise<IgnoreCheck> {
  const { root, index, ports, configuration } = input;
  return readReference(root.checkout).then(reference => checkIgnores({
    guard: { root: root.checkout, identity: root.identity, exec: ports.execInput, fs: ports.fs },
    records: index.ignoreFiles, recordedGuard: index.ignoreGuard, reference, format: root.context.format,
    ignoreRules: configuration.ignoreRules,
    readIgnoreRules: async () => (await readProjectionConfiguration(ports.exec, root.checkout)).ignoreRules,
  }));
}

/** Use the writer's arrival evidence without completing its ownership journal on disk. */
export async function readRemovalHandoffs(input: ProjectionRemovalObservationInput): Promise<ProjectionIndex> {
  const paths = Object.keys(input.index.entries).filter(path => {
    const entry = input.index.entries[path];
    return entry?.kind === "record" && entry.handoff !== undefined;
  });
  if (paths.length === 0) return input.index;
  const ignores = await readRemovalIgnoreCheck(input);
  if (ignores.kind === "refused" && ignores.reason === "guard-failed") throw new Error(`${ignores.failure}; ${ignores.remedy}`);
  return observeProjectionHandoffs({ checkout: input.root.checkout, context: input.root.context,
    writable: writableUnder(ignores, guardedProjectionRoots(input.root.identity).map(root => root.path)),
    blockedByLink: () => null }, input.index, paths);
}

/** An accepted adoption stays held until a command installs it, including after its recording has finished. */
export async function checkPendingProjectionReadBack(input: ProjectionRemovalObservationInput, path: string): Promise<ProjectionRemovalCheck> {
  const ignores = await readRemovalIgnoreCheck(input);
  if (ignores.kind === "refused" && ignores.reason === "guard-failed") return { kind: "unobservable", detail: `${ignores.failure}; ${ignores.remedy}` };
  const writable = writableUnder(ignores, guardedProjectionRoots(input.root.identity).map(root => root.path));
  if (!writable(path) && ignores.kind === "refused") return { kind: "would-refuse", remedy: { text: ignores.remedy } };
  return { kind: "would-refuse", remedy: { text: `Run arc save from ${input.root.checkout} to finish installing the accepted adoption at ${path}, then retry removal.` } };
}
