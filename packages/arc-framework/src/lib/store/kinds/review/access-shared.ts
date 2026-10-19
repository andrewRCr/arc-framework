/** Store selection and refusal handling shared by typed review-record access. */
import type { GitExec } from "../../../git/exec.js";
import type { Store } from "../../contract.js";
import { createStore } from "../../create.js";
import { createDefaultStorePorts } from "../../default-ports.js";
import type { RecordReference } from "../../identity.js";
import type { StoreRecord } from "../../read.js";
import type { StoreResult } from "../../refusal.js";

/** An explicit filesystem port retains direct adapter semantics. */
export interface ReviewRecordReader { readFile(path: string): Promise<string> }

/** An invocation may supply its existing store, Git runner, or explicit filesystem adapter. */
export interface ReviewRecordAccessOptions<TFs extends ReviewRecordReader> {
  store?: Store;
  exec?: GitExec;
  fs?: TFs;
}

/** Select the caller's store first, retaining direct filesystem access when explicitly requested. */
export function resolveReviewRecordAccess<TFs extends ReviewRecordReader>(cwd: string,
  input: TFs | ReviewRecordAccessOptions<TFs> | undefined): { store: Store } | { fs: TFs } {
  const options: ReviewRecordAccessOptions<TFs> = input === undefined ? {} : "readFile" in input ? { fs: input } : input;
  if (options.store !== undefined) return { store: options.store };
  if (options.fs !== undefined) return { fs: options.fs };
  return { store: createStore(createDefaultStorePorts({ checkoutRoot: cwd,
    ...(options.exec === undefined ? {} : { exec: options.exec }) })) };
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
  return unwrapReviewRecordResult(result);
}
