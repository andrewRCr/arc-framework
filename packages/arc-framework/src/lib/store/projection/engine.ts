/** Command-scoped entry points for writing back and settling projected files. */
import type { ProjectionStubMintPort } from "./stub-mint-port.js";
import { join } from "node:path";
import { ArcError } from "../../kernel/index.js";
import type { Store } from "../contract.js";
import { retryEndedItemHistory } from "../history-retry.js";
import type { StateVersion } from "../identity.js";
import type { RefusedMark } from "./index-schema.js";
import { canonicalCheckoutSync } from "./checkout-identity.js";
import { createProjectionEnginePorts, type ProjectionEnginePorts } from "./engine-ports.js";
import { locateProjection, type ProjectionLocation } from "./location.js";
import { type ProjectionLockResult } from "./lock.js";
import type { TrackedStateRefusal } from "../selection.js";
import { beginProjectionCommand, projectionProcessState, projectionSwitchedOff, recordEngineStoreCapability, type ProjectionSkip,
  type ProjectionCommandBinding } from "./process-state.js";
import { withProjectionFanOutLock } from "./fan-out-lock.js";
import { bindProjectionFanOut, disposeProjectionFanOut } from "./fan-out-binding.js";
import { runProjectionFanOut } from "./fan-out.js";
import { settleUnmarkedOwnWrites } from "./fan-out-scheduler.js";
import { startUnderLease, startWithoutProjection, type ProjectionStartInput } from "./engine-start.js";
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
  /** The refusal a Git hook command runs under while `HEAD` tracks ARC state, with its projection switched off. */
  readonly trackedState?: TrackedStateRefusal;
  /** The command runs where no checkout holds a projection, so it starts with none and reads nothing to find one. */
  readonly unprojected?: boolean;
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
export async function startProjection(command: ProjectionCommandInput): Promise<ProjectionStart> {
  // Synchronous, so the command's state exists before a concurrent reader can look for it.
  const input = { ...command, checkout: canonicalCheckoutSync(command.checkout) };
  const state = beginProjectionCommand();
  state.command = { store: input.store, checkout: input.checkout, ...(input.mint === undefined ? {} : { mint: input.mint }) };
  // The store keys its capability by the root it was built over, the caller's spelling.
  recordEngineStoreCapability(command.checkout, input.store.capabilities.stateOffBranch);
  const skip = switchedOffSkip(input);
  if (skip !== null) {
    state.skip = skip;
    state.start = { kind: "skipped", skip, pending: [] };
    return state.start;
  }
  try { state.start = await initializeProjection(input); }
  catch (error) {
    if (!(error instanceof ArcError) || !["store.layout-marker-unreadable", "store.layout-marker-invalid", "store.layout-config-invalid"].includes(error.code)) throw error;
    // A marker or layout configuration fault is this checkout's alone, so the fan-out still reaches its siblings.
    state.faulted.add(input.checkout);
    const mark: RefusedMark = { reason: error.message, remedy: {
      text: "Repair the checkout metadata named above, then retry. Pending edits remain in their files.",
    } };
    state.diagnostics.push({ path: input.checkout, copy: null, mark });
    state.start = { kind: "refused", mark };
  }
  return state.start;
}

function switchedOffSkip(input: ProjectionCommandInput): ProjectionSkip | null {
  if (input.trackedState !== undefined) {
    return { reason: "tracked-state", mark: { reason: `Projection skipped: ${input.trackedState.condition}`,
      remedy: { text: input.trackedState.remedy.text } } };
  }
  if (input.skipProjection !== true) return null;
  return { reason: "switch", mark: { reason: "Projection skipped by --skip-projection.",
    remedy: { text: "Run the command without --skip-projection to take in its pending edits." } } };
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
  if (input.unprojected === true) return startWithoutProjection(input);
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
    run: (ownWrites, _round, scope) => runProjectionFanOut({ ...input, ports: () => ports, location }, ownWrites, scope) });
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
export async function endProjection(command: ProjectionCommandInput): Promise<void> {
  const input = { ...command, checkout: canonicalCheckoutSync(command.checkout) };
  await settleUnmarkedOwnWrites(input.checkout);
  disposeProjectionFanOut();
  const state = projectionProcessState();
  state.materializeSpawn = null;
  if (projectionSwitchedOff(state.skip)) return;
  recordEngineStoreCapability(command.checkout, input.store.capabilities.stateOffBranch);
  if (!input.store.capabilities.stateOffBranch) return;
  for (const root of state.roots.values()) await finishProjectionRoot(root);
}

/** Retain a lock failure and its retry remedy for command reporting and remaining projection work. */
export function recordProjectionLockSkip(checkout: string, result: Exclude<ProjectionLockResult<never>, { status: "done" }>, pending: ReadonlySet<string>): Extract<ProjectionStart, { kind: "skipped" }> {
  const reason = result.status === "held" ? `Projection lock held by ${JSON.stringify(result.holder)}.`
    : result.status === "lost" ? `Projection lease lost: ${result.report}`
    : result.status === "mismatch" || result.status === "unwritable" ? result.report : "The worktree's Git directory is missing.";
  const skip: ProjectionSkip = { reason: result.status, mark: { reason, remedy: {
    text: "The command will run with projection disabled. Retry after the lock or Git directory is available; unsent edits remain in their files.",
  } } };
  const state = projectionProcessState();
  state.skip = skip;
  state.diagnostics.push({ path: checkout, copy: null, mark: skip.mark });
  for (const path of pending) state.diagnostics.push({ path, copy: null, mark: skip.mark });
  return { kind: "skipped", skip, pending: [...pending] };
}
