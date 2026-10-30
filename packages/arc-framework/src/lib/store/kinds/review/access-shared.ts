/** Store selection and refusal handling shared by typed review-record access. */
import type { GitExec } from "../../../git/exec.js";
import type { Store } from "../../contract.js";
import { createStore } from "../../create.js";
import { createDefaultStorePorts } from "../../default-ports.js";
import { retryEndedItemHistory } from "../../history-retry.js";
import type { RecordReference, OwnerIdentity } from "../../identity.js";
import type { StoreRecord } from "../../read.js";
import type { StoreResult } from "../../refusal.js";
import { describeRecordConflicts } from "../../conflict-diagnostics.js";

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

/** Preserve the store's condition and retry remedy for every non-absence refusal. */
export function unwrapReviewRecordResult<T>(result: StoreResult<T>): T {
  if (result.status === "refused") throw new Error(`${result.refusal.condition} ${result.refusal.remedy.text}`);
  return result.result;
}

/** Read one record, distinguishing established absence from every other refusal. */
export async function readReviewRecord(store: Store, reference: RecordReference): Promise<StoreRecord | null> {
  const result = await store.read({ reference });
  if (result.status === "refused" && result.refusal.code === "not-found") return null;
  const record = unwrapReviewRecordResult(result);
  if (record.conflicts.length > 0) throw new Error(`Review record has unresolved conflicts.${describeRecordConflicts(record.conflicts)}`);
  return record;
}
