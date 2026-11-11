/** Bind one checkout's projection operations independently of the command's entering checkout. */
import { readUnchangedProjectionFile } from "./unchanged-file.js";
import { flushProjectionFanOut } from "./fan-out-scheduler.js";
import { readProjectionCheckoutContext } from "../checkout-layout.js";
import { refreshProjectionRoot } from "./refresh.js";
import { reprojectProjectionRoot } from "./reprojection.js";
import { refuseOwnershipHandoff } from "./ownership-hold.js";
import { createProjectionLocalCapture } from "./engine-capture.js";
import { createWriteBackPort } from "./write-back.js";
import type { ReadBackContext } from "./read-back.js";
import { sameReference } from "../identity.js";
import { bindProjectionRights, refuseProjectionEdit } from "./rights-binding.js";
import { createProjectionProtection } from "./protection.js";
import { interpretProjectionView } from "./view-settings.js";
import { createProjectionLinkBoundary } from "./discovery-links.js";
import { observeProjectionEdit } from "./edit-observation.js";
import type { Store } from "../contract.js";
import type { HistoryMemo } from "./base-recovery.js";
import type { ProjectionConfiguration } from "./configuration.js";
import type { ProjectionEnginePorts } from "./engine-ports.js";
import type { ProjectionLocation } from "./location.js";
import type { ProjectionLockSession } from "./lock.js";
import { projectionProcessState, type ProjectionRootState } from "./process-state.js";
import type { ProjectionStubMintPort } from "./stub-mint-port.js";

/** Target-local configuration and command-owned resources, supplied after capability and identity checks. */
export interface ProjectionRootBindingInput {
  readonly checkout: string;
  readonly store: Store;
  readonly location: ProjectionLocation;
  readonly configuration: ProjectionConfiguration;
  readonly ports: ProjectionEnginePorts;
  readonly actor: string;
  readonly history: HistoryMemo;
  readonly session: ProjectionLockSession;
  readonly register: boolean;
  readonly mode?: "save" | "write-back";
  readonly mint?: ProjectionStubMintPort;
  readonly unsent?: Set<string>;
  readonly links?: readonly string[];
}

/** Bind reads, rights, capture, and replacement bookkeeping to the target checkout. */
export async function bindProjectionRoot(input: ProjectionRootBindingInput): Promise<ProjectionRootState> {
  const { configuration: config, ports, location, session, actor } = input;
  const unsent = input.unsent ?? new Set<string>();
  if (config.identity.status !== "identified") throw new Error("A projection root needs an identity");
  const state = projectionProcessState();
  const { layout, uid } = await readProjectionCheckoutContext(input.checkout);
  const writer = await ports.writer();
  await session.step();
  const checkpoint = async (): Promise<void> => {
    if (root.checkpoint === null) throw new Error("A projection mutation requires its worktree's lease");
    await root.checkpoint();
  };
  const context: ReadBackContext = { store: input.store, location, format: config.objectFormat, actor, writer, memo: input.history, versionRecoveries: [],
    registry: ports.registry,
    captureLocal: createProjectionLocalCapture(input),
    protection: createProjectionProtection({ store: input.store, checkout: input.checkout, identity: config.identity.identity, exec: ports.exec, verb: input.mode ?? "write-back" }),
    verb: input.mode ?? "write-back", checkpoint, hooks: ports.hooks, takeIn: request => root.takeIn(request),
    onWrite: () => { root.changed = true; }, onSend: () => { root.sent = true; },
    report: diagnostic => {
      state.diagnostics.push(diagnostic);
      const intent = state.command?.checkout === input.checkout ? state.resolution : null;
      if (intent?.target?.path === diagnostic.path && diagnostic.copy === null && !intent.accepted
        && !diagnostic.mark.reason.startsWith("unshown-conflict:")) intent.refusal = diagnostic.mark;
    }, reportResolution: resolution => {
      state.resolutions.push(resolution);
      const intent = state.command?.checkout === input.checkout ? state.resolution : null;
      if (intent?.target?.resolution.kind === "stored" && sameReference(intent.target.resolution.reference, resolution.reference)) intent.accepted = true;
    },
    reportExplicitResolution: () => { if (state.command?.checkout === input.checkout && state.resolution !== null) state.resolution.accepted = true; },
    recordBatch: batch => { root.copies.push(...batch.copies); root.removals.push(...batch.removals); } };
  const send = createWriteBackPort(context);
  const root: ProjectionRootState = { checkout: input.checkout, store: input.store, location, ports, context, identity: config.identity.identity,
    claim: layout.claim, claimUid: uid, layoutActive: layout.layoutActive, view: interpretProjectionView(config.view).view,
    blockedByLink: createProjectionLinkBoundary(input.links ?? []),
    mint: input.mint, checkpoint: session.step, copies: [], removals: [], unsent, discovered: [], changed: false,
    sent: state.roots.get(input.checkout)?.sent ?? false, sweepEmpty: state.roots.get(input.checkout)?.sweepEmpty,
    fanOutTimes: state.roots.get(input.checkout)?.fanOutTimes,
    ready: false, writable: () => false, rights: bindProjectionRights(input.store, config.identity.identity, ports.exec, input.mode ?? "write-back"), takeIn: async request => {
      const held = refuseOwnershipHandoff(request.entry);
      if (held !== null) {
        context.report?.({ path: request.path, copy: request.copy, mark: held.mark });
        return held;
      }
      const unchanged = await readUnchangedProjectionFile(context, request);
      if (unchanged !== null) {
        root.unsent.delete(request.path);
        return { answer: "no-edit", entry: request.entry, read: unchanged };
      }
      request = observeProjectionEdit(request);
      const denied = await root.rights?.(request);
      if (denied === undefined || denied === null) return send(request);
      root.unsent.add(request.path);
      context.report?.({ path: request.path, copy: request.copy, mark: denied });
      return refuseProjectionEdit(request.entry, denied);
    } };
  root.fanOut = flushProjectionFanOut;
  root.refresh = request => refreshProjectionRoot({ ...request, root, configuration: config });
  root.reproject = request => reprojectProjectionRoot({ ...request, root, configuration: config });
  if (input.register) state.roots.set(input.checkout, root);
  return root;
}

/** Re-read a held root's path-local layout without replacing its copy bookkeeping. */
export async function refreshProjectionRootLayout(root: ProjectionRootState): Promise<void> {
  const { layout, uid } = await readProjectionCheckoutContext(root.checkout);
  root.claim = layout.claim;
  root.claimUid = uid;
  root.layoutActive = layout.layoutActive;
}
