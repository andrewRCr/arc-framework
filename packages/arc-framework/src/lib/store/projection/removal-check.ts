/** Observe whether a checkout's projected edits can safely survive retirement. */
import type { Slug } from "../../kernel/index.js";
import type { ProjectionRemovalSlots } from "../../git/worktree-removal.js";
import type { Store } from "../contract.js";
import { observeUnprojectedPersonalFiles, type ProjectionResidualFs } from "./removal-residual.js";
import { createProjectionEnginePorts, type ProjectionEnginePorts } from "./engine-ports.js";
import { locateProjection } from "./location.js";
import { checkoutHoldsProjection } from "./ownership.js";
import { readProjectionIndex } from "./index-file.js";
import { readProjectionConfiguration } from "./configuration.js";
import { bindReadOnlyProjectionRoot } from "./engine-read-only.js";
import { createHistoryMemo } from "./base-recovery.js";
import { projectedRootPaths } from "../../layout/index.js";
import { checkProjectionRemovalFiles } from "./removal-files.js";
import { observeProjectionReads } from "./read-observation.js";
import { readRemovalHandoffs } from "./removal-observations.js";
import { checkProjectionRemovalAsides } from "./removal-asides.js";

/** The command's store authority and independently target-bound host operations. */
export interface ProjectionRemovalContext {
  readonly store: Store;
  readonly residualFs?: ProjectionResidualFs;
  readonly identity: Slug | null;
  readonly ports?: (checkout: string) => ProjectionEnginePorts;
}

/** Check projected retirement safety without acquiring a lease or changing local or stored state. */
export async function checkProjectionRemoval(checkout: string, context: ProjectionRemovalContext, disposition: "remove" | "release" = "remove"): Promise<Awaited<ReturnType<ProjectionRemovalSlots["check"]>>> {
  try {
    const ports = context.ports?.(checkout) ?? createProjectionEnginePorts(checkout);
    const location = await locateProjection(checkout, ports);
    const disk = await readProjectionIndex(location, await checkoutHoldsProjection(checkout, location), { groups: "all", retry: true });
    if (disk.kind === "unusable") return { kind: "unobservable", detail:
      `The projection index at ${checkout} is ${disk.cause}. Run arc save from that checkout to rebuild it, then retry removal or release there.` };
    if (disk.kind === "no-projection") return disposition === "release" ? { kind: "passes" }
      : await observeUnprojectedPersonalFiles(checkout, context.residualFs);
    const configuration = await readProjectionConfiguration(ports.exec, checkout);
    if (configuration.identity.status === "no-identity") return { kind: "would-refuse", remedy: configuration.identity.remedy };
    const targetIdentity = configuration.identity.identity;
    if (targetIdentity !== context.identity) return { kind: "unobservable", detail:
      `The target ${checkout} uses identity ${targetIdentity}, while this command ${context.identity === null ? "has no resolved identity" : `uses ${context.identity}`}. Run removal or release from that checkout under its identity.` };
    const observed = observeProjectionReads(context.store);
    const root = await bindReadOnlyProjectionRoot({ checkout, store: observed.store, ports, location, configuration,
      history: createHistoryMemo(observed.store) });
    const index = await readRemovalHandoffs({ root, index: disk.index, ports, configuration });
    const files = await checkProjectionRemovalFiles({ root, index, roots: projectedRootPaths(targetIdentity), ports, configuration });
    const result = files.verdict.kind === "passes"
      ? await checkProjectionRemovalAsides({ root, index: files.index, ports, configuration }) : files.verdict;
    const unreadable = observed.nativeFailure();
    return unreadable === undefined ? result : { kind: "unobservable", detail: unreadable.remedy.text };
  } catch (error) {
    return { kind: "unobservable", detail: `Cannot observe the projection at ${checkout}: ${error instanceof Error ? error.message : String(error)}` };
  }
}
