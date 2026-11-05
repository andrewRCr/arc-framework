/** One command's projection bindings, shared by stores constructed at different call sites. */
import type { Slug } from "../../kernel/index.js";
import type { Store } from "../contract.js";
import type { HistoryMemo } from "./base-recovery.js";
import type { ProjectionLocation } from "./location.js";
import type { ProjectionEnginePorts } from "./engine-ports.js";
import type { ReadBackContext } from "./read-back.js";
import type { RefusedMark } from "./index-schema.js";
import type { TakeInPort, TakeInRequest } from "./take-in-port.js";
import type { WriteBackDiagnostic, WriteBackResolution } from "./write-back.js";
import type { ProjectionStart } from "./engine.js";
import type { ProjectionResolution } from "./save-resolution.js";

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
  mint?: (path: string) => Promise<void>;
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
  readonly fanOutRounds: Set<string>;
  readonly notices: string[];
  readonly diagnostics: WriteBackDiagnostic[];
  readonly resolutions: WriteBackResolution[];
}

function freshState(capabilities = new Map<string, boolean>()): ProjectionProcessState {
  return { command: null, start: null, resolution: null, skip: null, lockHeld: false, history: null, roots: new Map(), capabilities, fanOutRounds: new Set(),
    notices: [], diagnostics: [], resolutions: [] };
}
const key = Symbol.for("arc.projection.command-state");
const processState = globalThis as typeof globalThis & { [key]?: ProjectionProcessState };

/** Read the current command's bindings without consulting a store, configuration, or filesystem. */
export function projectionProcessState(): ProjectionProcessState { return processState[key] ??= freshState(); }

/** Start a new command, dropping old ports, memoized history, skip verdicts, and copy bookkeeping. */
export function beginProjectionCommand(): ProjectionProcessState {
  return processState[key] = freshState(projectionProcessState().capabilities);
}
