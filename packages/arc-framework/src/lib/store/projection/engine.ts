/** Command-scoped entry points for writing back and settling projected files. */
import type { ProjectionStubMintPort } from "./stub-mint-port.js";
import { join } from "node:path";
import { ArcError } from "../../kernel/index.js";
import type { Store } from "../contract.js";
import { retryEndedItemHistory } from "../history-retry.js";
import type { StateVersion } from "../identity.js";
import type { RefusedMark } from "./index-schema.js";
import { createProjectionEnginePorts, type ProjectionEnginePorts } from "./engine-ports.js";
import { locateProjection, type ProjectionLocation } from "./location.js";
import { type ProjectionLockResult } from "./lock.js";
import { beginProjectionCommand, projectionProcessState, recordEngineStoreCapability, type ProjectionSkip, type ProjectionCommandBinding } from "./process-state.js";
import { withProjectionFanOutLock } from "./fan-out-lock.js";
import { bindProjectionFanOut, disposeProjectionFanOut } from "./fan-out-binding.js";
import { runProjectionFanOut } from "./fan-out.js";
import { startUnderLease, type ProjectionStartInput } from "./engine-start.js";
import { finishProjectionRoot } from "./engine-end.js";
import { projectionTimingNow } from "./timings.js";

/** The command's store and checkout; disabled backends consult no other dependency. */
export interface ProjectionCommandInput {
  readonly store: Store;
  readonly checkout: string;
  readonly mode?: "write-back" | "save";
  readonly resolve?: string;
  /** Bypass automatic projection work for this command alone. */
  readonly skipProjection?: boolean;
  readonly ports?: () => ProjectionEnginePorts;
  readonly location?: ProjectionLocation;
  readonly mint?: ProjectionStubMintPort;
}

/** What command initialization established about its projection. */
export type ProjectionStart =
  | { readonly kind: "disabled" | "no-projection" }
  | { readonly kind: "ready"; readonly version: StateVersion; readonly discovered: readonly string[] }
  | { readonly kind: "skipped"; readonly skip: ProjectionSkip; readonly pending: readonly string[] }
  | { readonly kind: "refused"; readonly mark: RefusedMark };

/** Take in pending edits before the command runs, preserving its ordinary execution when projection is unavailable. */
export async function startProjection(input: ProjectionCommandInput): Promise<ProjectionStart> {
  const state = beginProjectionCommand();
  state.command = { store: input.store, checkout: input.checkout };
  recordEngineStoreCapability(input.checkout, input.store.capabilities.stateOffBranch);
  if (input.skipProjection === true) {
    state.skip = { reason: "switch", mark: { reason: "Projection skipped by --skip-projection.",
      remedy: { text: "Run the command without --skip-projection to take in its pending edits." } } };
    state.start = { kind: "skipped", skip: state.skip, pending: [] };
    return state.start;
  }
  try { state.start = await initializeProjection(input); }
  catch (error) {
    if (!(error instanceof ArcError) || !["store.layout-marker-unreadable", "store.layout-marker-invalid", "store.layout-config-invalid"].includes(error.code)) throw error;
    disposeProjectionFanOut();
    const mark: RefusedMark = { reason: error.message, remedy: {
      text: "Repair the checkout metadata named above, then retry. Pending edits remain in their files.",
    } };
    state.diagnostics.push({ path: input.checkout, copy: null, mark });
    state.start = { kind: "refused", mark };
  }
  return state.start;
}

/** Return the command's original selection without reopening a backend or resolving its checkout. */
export function projectionCommandBinding(): ProjectionCommandBinding {
  const binding = projectionProcessState().command;
  if (binding === null) throw new Error("The projection command has not been initialized.");
  return binding;
}

async function initializeProjection(input: ProjectionCommandInput): Promise<ProjectionStart> {
  const state = projectionProcessState();
  if (!input.store.capabilities.stateOffBranch) return { kind: "disabled" };
  const effective = historyRetryInput(input);
  const ports = input.ports?.() ?? createProjectionEnginePorts(input.checkout);
  const startedAt = projectionTimingNow(ports);
  const unsent = new Set<string>();
  let location = input.location;
  if (location === undefined) {
    try { await ports.fs.lstat(join(input.checkout, ".git")); }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      return recordProjectionLockSkip(input.checkout, { status: "gone" }, unsent);
    }
    location = await locateProjection(input.checkout, ports);
  }
  await bindProjectionFanOut({ checkout: input.checkout, location, ports,
    run: ownWrites => runProjectionFanOut({ ...input, ports: () => ports, location }, ownWrites) });
  const result = await withProjectionFanOutLock(location, async session => {
    const started = await startUnderLease(effective, ports, location, session, unsent, startedAt);
    const root = state.roots.get(input.checkout);
    if (root?.ready && root.changed) state.fanOutRounds.add(input.checkout);
    return started;
  },
    { invalidatePartition: true, ...(ports.maxWaitMs === undefined ? {} : { maxWaitMs: ports.maxWaitMs }) }, ports.lock);
  if (result.status !== "done") return recordProjectionLockSkip(input.checkout, result, unsent);
  if (result.value.kind === "refused") state.diagnostics.push({ path: input.checkout, copy: null, mark: result.value.mark });
  if (result.value.kind === "skipped") {
    const mark = result.value.skip.mark;
    state.diagnostics.push({ path: input.checkout, copy: null, mark });
    for (const path of result.value.pending) state.diagnostics.push({ path, copy: null, mark });
  }
  return result.value;
}

function historyRetryInput(input: ProjectionCommandInput): ProjectionStartInput {
  return input.mode === "save" ? { ...input, source: input.store,
    store: retryEndedItemHistory(input.store, line => { projectionProcessState().notices.push(line); }),
  } : { ...input, source: input.store };
}

/** Settle the copies accumulated by this command under freshly acquired locks. */
export async function endProjection(input: ProjectionCommandInput): Promise<void> {
  disposeProjectionFanOut();
  const state = projectionProcessState();
  state.materializeSpawn = null;
  if (state.skip?.reason === "switch") return;
  recordEngineStoreCapability(input.checkout, input.store.capabilities.stateOffBranch);
  if (!input.store.capabilities.stateOffBranch) return;
  for (const root of state.roots.values()) await finishProjectionRoot(root);
}

/** Retain a lock failure and its retry remedy for command reporting and remaining projection work. */
export function recordProjectionLockSkip(checkout: string, result: Exclude<ProjectionLockResult<never>, { status: "done" }>, pending: ReadonlySet<string>): Extract<ProjectionStart, { kind: "skipped" }> {
  const reason = result.status === "held" ? `Projection lock held by ${JSON.stringify(result.holder)}.`
    : result.status === "lost" ? `Projection lease lost: ${result.report}`
    : result.status === "mismatch" ? result.report : "The worktree's Git directory is missing.";
  const skip: ProjectionSkip = { reason: result.status, mark: { reason, remedy: {
    text: "The command will run with projection disabled. Retry after the lock or Git directory is available; unsent edits remain in their files.",
  } } };
  const state = projectionProcessState();
  state.skip = skip;
  state.diagnostics.push({ path: checkout, copy: null, mark: skip.mark });
  for (const path of pending) state.diagnostics.push({ path, copy: null, mark: skip.mark });
  return { kind: "skipped", skip, pending: [...pending] };
}
