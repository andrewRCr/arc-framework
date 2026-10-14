/** Caller-provided record bases and recoverable Git steps around lifecycle batches. */
import type { Mutation } from "../store/write.js";
import type { StoreRecord } from "../store/read.js";
import type { WritePlacement } from "../store/placement.js";
import type { CallerProvenance, Links } from "../store/links.js";

/** One idempotent operation with its undo and executable continuation. */
export interface LifecycleGitStep {
  name: string;
  run: () => Promise<void>;
  rollback?: () => Promise<void>;
  retryCommand: readonly string[];
}

/** A persisted transition whose physical Git continuation remains unfinished. */
export interface LifecycleGitContinuation {
  kind: "git-step";
  step: string;
  reason: string;
  argv: readonly string[];
}

/** Writes the verb prepares in addition to the executor-owned state and workflow fields. */
export interface StoreTransitionInputs {
  primary?: StoreRecord;
  create?: Extract<Mutation, { action: "put" }>;
  content?: string;
  placement?: WritePlacement;
  links?: Links;
  additionalWrites?: Mutation[];
  provenance?: CallerProvenance;
  gitSteps?: LifecycleGitStep[];
}
