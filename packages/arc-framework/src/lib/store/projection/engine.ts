/** Command-scoped entry points for writing back and settling projected files. */
import { join } from "node:path";
import type { Store } from "../contract.js";
import { retryEndedItemHistory } from "../history-retry.js";
import type { StateVersion } from "../identity.js";
import type { RefusedMark } from "./index-schema.js";
import { createProjectionEnginePorts, type ProjectionEnginePorts } from "./engine-ports.js";
import { locateProjection, type ProjectionLocation } from "./location.js";
import { withProjectionLock, type ProjectionLockResult } from "./lock.js";
import { beginProjectionCommand, projectionProcessState, recordEngineStoreCapability, type ProjectionSkip, type ProjectionCommandBinding } from "./process-state.js";
import { startUnderLease } from "./engine-start.js";
import { finishProjectionRoot } from "./engine-end.js";

/** The command's store and checkout; disabled backends consult no other dependency. */
export interface ProjectionCommandInput {
  readonly store: Store;
  readonly checkout: string;
  readonly mode?: "write-back" | "save";
  readonly resolve?: string;
  readonly ports?: () => ProjectionEnginePorts;
  readonly location?: ProjectionLocation;
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
  state.start = await initializeProjection(input);
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
  recordEngineStoreCapability(input.checkout, input.store.capabilities.stateOffBranch);
  if (!input.store.capabilities.stateOffBranch) return { kind: "disabled" };
  const effective = historyRetryInput(input);
  const ports = input.ports?.() ?? createProjectionEnginePorts(input.checkout);
  const unsent = new Set<string>();
  let location = input.location;
  if (location === undefined) {
    try { await ports.fs.lstat(join(input.checkout, ".git")); }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      return skipped(input.checkout, { status: "gone" }, unsent);
    }
    location = await locateProjection(input.checkout, ports);
  }
  const result = await withProjectionLock(location, session => startUnderLease(effective, ports, location, session, unsent),
    ports.maxWaitMs === undefined ? {} : { maxWaitMs: ports.maxWaitMs }, ports.lock);
  if (result.status !== "done") return skipped(input.checkout, result, unsent);
  if (result.value.kind === "refused") state.diagnostics.push({ path: input.checkout, copy: null, mark: result.value.mark });
  if (result.value.kind === "skipped") {
    const mark = result.value.skip.mark;
    state.diagnostics.push({ path: input.checkout, copy: null, mark });
    for (const path of result.value.pending) state.diagnostics.push({ path, copy: null, mark });
  }
  const root = state.roots.get(input.checkout);
  if (root?.ready && root.changed) {
    state.fanOutRounds.add(input.checkout);
    await root.fanOut?.();
  }
  return result.value;
}

function historyRetryInput(input: ProjectionCommandInput): ProjectionCommandInput {
  return input.mode === "save" ? { ...input,
    store: retryEndedItemHistory(input.store, line => { projectionProcessState().notices.push(line); }),
  } : input;
}

/** Settle the copies accumulated by this command under freshly acquired locks. */
export async function endProjection(input: ProjectionCommandInput): Promise<void> {
  const state = projectionProcessState();
  recordEngineStoreCapability(input.checkout, input.store.capabilities.stateOffBranch);
  if (!input.store.capabilities.stateOffBranch) return;
  for (const root of state.roots.values()) await finishProjectionRoot(root);
}

function skipped(checkout: string, result: Exclude<ProjectionLockResult<never>, { status: "done" }>, pending: ReadonlySet<string>): ProjectionStart {
  const reason = result.status === "held" ? `Projection lock held by ${JSON.stringify(result.holder)}.`
    : result.status === "lost" ? `Projection lease lost: ${result.report}` : "The worktree's Git directory is missing.";
  const skip: ProjectionSkip = { reason: result.status, mark: { reason, remedy: {
    text: "The command will run with projection disabled. Retry after the lock or Git directory is available; unsent edits remain in their files.",
  } } };
  const state = projectionProcessState();
  state.skip = skip;
  state.diagnostics.push({ path: checkout, copy: null, mark: skip.mark });
  for (const path of pending) state.diagnostics.push({ path, copy: null, mark: skip.mark });
  return { kind: "skipped", skip, pending: [...pending] };
}
