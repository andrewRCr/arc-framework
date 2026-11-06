/** One command's projection bindings, shared by stores constructed at different call sites. */
import type { Slug } from "../../kernel/index.js";
import type { ActiveLayoutContext } from "../../layout/index.js";
import { onCheckoutChange } from "../../git/checkout-change.js";
import type { Store } from "../contract.js";
import type { HistoryMemo } from "./base-recovery.js";
import type { ProjectionStubMintPort } from "./stub-mint-port.js";
import type { ProjectionLocation } from "./location.js";
import type { ProjectionEnginePorts } from "./engine-ports.js";
import type { ReadBackContext } from "./read-back.js";
import type { ProjectionIndex, RefusedMark } from "./index-schema.js";
import type { ProjectionConfiguration } from "./configuration.js";
import type { TakeInPort, TakeInRequest } from "./take-in-port.js";
import type { WriteBackDiagnostic, WriteBackResolution } from "./write-back.js";
import type { ProjectionStart } from "./engine.js";
import type { ProjectionResolution } from "./save-resolution.js";
import type { ProjectionLinkBoundary } from "./discovery-links.js";

/** A start that disables this command's projection while preserving the command's ordinary execution. */
export interface ProjectionSkip { readonly reason: "no-identity" | "held" | "lost" | "gone" | "switch"; readonly mark: RefusedMark }

/** Bound edit policy; an absent policy grants the edit. */
export type ProjectionRights = (request: TakeInRequest) => Promise<RefusedMark | null>;

/** The selected backend and checkout, retained even when initialization is disabled or refused. */
export interface ProjectionCommandBinding {
  readonly store: Store;
  readonly checkout: string;
}

/** Per-worktree bindings and copy bookkeeping owned by this command. */
export interface ProjectionRootState {
  readonly checkout: string;
  readonly store: Store;
  readonly location: ProjectionLocation;
  readonly ports: ProjectionEnginePorts;
  readonly context: ReadBackContext;
  readonly takeIn: TakeInPort;
  readonly identity: Slug;
  readonly view: ProjectionIndex["projectedUnder"]["view"];
  readonly blockedByLink: ProjectionLinkBoundary;
  claim: Slug | null;
  layoutActive: "nested" | "flat";
  checkpoint: (() => Promise<void>) | null;
  readonly copies: { path: string; copy: string }[];
  readonly removals: string[];
  readonly unsent: Set<string>;
  readonly discovered: string[];
  changed: boolean;
  ready: boolean;
  writable: (path: string) => boolean;
  rights?: ProjectionRights;
  mint?: ProjectionStubMintPort;
  refresh?: () => Promise<void>;
  fanOut?: () => Promise<void>;
  materialize?: () => Promise<void>;
}

/** Mutable state with a deliberate command boundary; no binding outlives the next start. */
export interface ProjectionProcessState {
  command: ProjectionCommandBinding | null;
  start: ProjectionStart | null;
  resolution: ProjectionResolution | null;
  skip: ProjectionSkip | null;
  lockHeld: boolean;
  history: HistoryMemo | null;
  readonly roots: Map<string, ProjectionRootState>;
  readonly capabilities: Map<string, boolean>;
  readonly composedCapabilities: Map<string, boolean>;
  readonly engineCapabilityRoots: Set<string>;
  readonly layoutContexts: Map<string, Promise<ActiveLayoutContext>>;
  readonly configurations: Map<string, Promise<ProjectionConfiguration>>;
  readonly fanOutRounds: Set<string>;
  readonly notices: string[];
  readonly diagnostics: WriteBackDiagnostic[];
  readonly resolutions: WriteBackResolution[];
}

function freshState(composedCapabilities = new Map<string, boolean>()): ProjectionProcessState {
  return { command: null, start: null, resolution: null, skip: null, lockHeld: false, history: null, roots: new Map(),
    capabilities: new Map(composedCapabilities), composedCapabilities,
    engineCapabilityRoots: new Set(), layoutContexts: new Map(), configurations: new Map(), fanOutRounds: new Set(),
    notices: [], diagnostics: [], resolutions: [] };
}
const key = Symbol.for("arc.projection.command-state");
const processState = globalThis as typeof globalThis & { [key]?: ProjectionProcessState };

/** Read the current command's bindings without consulting a store, configuration, or filesystem. */
export function projectionProcessState(): ProjectionProcessState { return processState[key] ??= freshState(); }

/** Record the layout capability of a lazily composed local operational store. */
export function recordComposedStoreCapability(checkoutRoot: string, stateOffBranch: boolean): void {
  const state = projectionProcessState();
  state.composedCapabilities.set(checkoutRoot, stateOffBranch);
  if (!state.engineCapabilityRoots.has(checkoutRoot)) setEffectiveCapability(state, checkoutRoot, stateOffBranch);
}

/** Keep the command engine's selected capability authoritative over later composition. */
export function recordEngineStoreCapability(checkoutRoot: string, stateOffBranch: boolean): void {
  const state = projectionProcessState();
  state.engineCapabilityRoots.add(checkoutRoot);
  setEffectiveCapability(state, checkoutRoot, stateOffBranch);
}

function setEffectiveCapability(state: ProjectionProcessState, checkoutRoot: string, stateOffBranch: boolean): void {
  if (state.capabilities.get(checkoutRoot) !== stateOffBranch) state.layoutContexts.delete(checkoutRoot);
  state.capabilities.set(checkoutRoot, stateOffBranch);
}

/** Start a new command, dropping old ports, memoized history, skip verdicts, and copy bookkeeping. */
export function beginProjectionCommand(): ProjectionProcessState {
  return processState[key] = freshState(projectionProcessState().composedCapabilities);
}

onCheckoutChange(change => {
  const state = projectionProcessState();
  if (change.kind === "marker") { state.layoutContexts.delete(change.checkoutRoot); return; }
  state.layoutContexts.delete(change.from);
  state.layoutContexts.delete(change.to);
  for (const capabilities of [state.capabilities, state.composedCapabilities]) {
    const value = capabilities.get(change.from);
    if (value !== undefined) capabilities.set(change.to, value);
    if (change.from !== change.to) capabilities.delete(change.from);
  }
  if (state.engineCapabilityRoots.delete(change.from)) state.engineCapabilityRoots.add(change.to);
});
