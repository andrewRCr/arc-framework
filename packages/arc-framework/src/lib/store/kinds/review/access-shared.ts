/** Store selection and refusal handling shared by typed review-record access. */
import type { GitExec } from "../../../git/exec.js";
import type { Store } from "../../contract.js";
import { createStore } from "../../create.js";
import { createDefaultStorePorts } from "../../default-store-ports.js";
import { retryEndedItemHistory } from "../../history-retry.js";
import { OwnerIdentitySchema, type RecordReference, type OwnerIdentity } from "../../identity.js";
import type { StoreRecord } from "../../read.js";
import type { StoreResult } from "../../refusal.js";
import { recordConflictRefusal } from "../../conflict-diagnostics.js";
import { StoreRefusalError } from "../../refusal-error.js";
import { ReviewOwnerSelectionError } from "./errors.js";

/** An explicit filesystem port retains direct adapter semantics. */
export interface ReviewRecordReader { readFile(path: string): Promise<string> }

/** An invocation may supply its existing store, Git runner, or explicit filesystem adapter. */
export interface ReviewRecordAccessOptions<TFs extends ReviewRecordReader> {
  store?: Store;
  /** Exact work-item generation retained by the invocation. */
  owner?: OwnerIdentity;
  exec?: GitExec;
  fs?: TFs;
}

/**
 * Select the caller's store first, retaining direct filesystem access when explicitly requested. A store opened here
 * retries an ended item's history.
 */
export function resolveReviewRecordAccess<TFs extends ReviewRecordReader>(cwd: string,
  input: TFs | ReviewRecordAccessOptions<TFs> | undefined): { store: Store; owner?: OwnerIdentity } | { fs: TFs } {
  const options: ReviewRecordAccessOptions<TFs> = input === undefined ? {} : "readFile" in input ? { fs: input } : input;
  if (options.store !== undefined) return { store: options.store, owner: options.owner };
  if (options.fs !== undefined) return { fs: options.fs };
  return { store: retryEndedItemHistory(createStore(createDefaultStorePorts({ checkoutRoot: cwd,
    ...(options.exec === undefined ? {} : { exec: options.exec }) }))), owner: options.owner };
}

/**
 * Select a work unit's review-record owner. In-repo records are keyed by slug; native ones only by the invocation's
 * exact work item, since a slug alone can name a live namesake of an ended item.
 */
export function selectReviewRecordOwner(store: Store, name: string, owner: OwnerIdentity | undefined): OwnerIdentity {
  if (!store.capabilities.stateOffBranch) return owner ?? OwnerIdentitySchema.parse({ type: "work-item", name });
  if (owner === undefined) {
    throw new ReviewOwnerSelectionError("invalid-input", `Review records for ${name} need the invocation's exact work item.`,
      { text: `Run the command from ${name}'s checkout, or continue it from the reference its producer emitted.` });
  }
  return owner;
}

/**
 * Refuse a stored review record that names another work unit than the one requested: in-repo as the tracked file's
 * mismatch, natively as the bound work item's record, which no tracked path holds.
 */
export function storedWorkUnitMismatch(store: Pick<Store, "capabilities">, record: string, requested: string, stored: string,
  inRepoMessage: string): Error {
  if (!store.capabilities.stateOffBranch) return new Error(inRepoMessage);
  return new ReviewOwnerSelectionError("invalid-input",
    `The bound work item's ${record} belongs to work unit \`${stored}\`, not \`${requested}\`.`,
    { text: `Name work unit \`${stored}\`, or run the command from \`${requested}\`'s checkout.` });
}

/** Carry every non-absence refusal whole, its message the store's condition and retry remedy. */
export function unwrapReviewRecordResult<T>(store: Pick<Store, "capabilities">, result: StoreResult<T>): T {
  if (result.status === "refused") throw new StoreRefusalError(result.refusal, store.capabilities.stateOffBranch);
  return result.result;
}

/** Read one record, distinguishing established absence from every other refusal. */
export async function readReviewRecord(store: Store, reference: RecordReference): Promise<StoreRecord | null> {
  const result = await store.read({ reference });
  if (result.status === "refused" && result.refusal.code === "not-found") return null;
  const record = unwrapReviewRecordResult(store, result);
  if (record.conflicts.length > 0) {
    throw new StoreRefusalError(recordConflictRefusal(record, "Review record", "review.record-conflict"), store.capabilities.stateOffBranch);
  }
  return record;
}

/** Whether an in-repo read refused a file whose own key names another work unit, which the file readers report themselves. */
export function isInRepoKeyMismatch(error: unknown): boolean {
  return error instanceof StoreRefusalError && !error.offBranch && error.refusal.code === "identity-mismatch";
}
