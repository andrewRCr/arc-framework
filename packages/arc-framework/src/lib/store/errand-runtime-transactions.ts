/** Capability selection for runtime identity operations, preserving the in-repo transaction path. */
import type { Store } from "./contract.js";
import type { StoreSyncPort } from "./operational-sync.js";
import type { Mutation } from "./write.js";
import type { Links } from "./links.js";
import type { ErrandRecordIO } from "../errand/ref-tree.js";
import { transactTransientIdentities, type IdentityTransactionOutcome } from "../errand/identity-transaction.js";
import { ordinaryErrandTransform, type OrdinaryErrandTransition, type OrdinaryErrandRecord } from "../errand/identity-transitions.js";
import type { TransientIdentityRecord } from "../errand/identity-record.js";
import { readStoreErrand, transitionStoreErrand } from "../errand/store-runtime.js";

/** Optional invocation-bound store and backend synchronization operations. */
export interface ErrandRuntimeStorageOptions {
  readonly store?: Store;
  readonly sync?: StoreSyncPort;
  readonly projectId?: () => Promise<string>;
  readonly now?: () => string;
  readonly provenanceVerb?: string;
  readonly companionWrites?: readonly Mutation[];
  readonly rollbackCompanionWrites?: () => Promise<readonly Mutation[]>;
}
/** Select the record reader without changing the transaction result consumed by runtime cores. */
export async function readRuntimeErrand(options: ErrandRuntimeStorageOptions, io: ErrandRecordIO,
  slug: string, remote: string | null = "origin", claimId?: string): Promise<IdentityTransactionOutcome<TransientIdentityRecord | null>> {
  if (!options.store?.capabilities.stateOffBranch) return transactTransientIdentities(io, {
    remote, message: `arc: reconcile errand identity ${slug}`,
    transform: (records) => ({ kind: "idempotent", value: records.get(slug) ?? null }),
  });
  const read = await readStoreErrand({ ...options, store: options.store, identity: io.identity }, slug, claimId);
  return read.kind === "ready" ? { kind: "idempotent", value: read.record, tip: null }
    : read.kind === "error" ? { ...read, stage: "basis" } : read;
}
/** Select one expected-state mutation without rerunning its transform after a version conflict. */
export function transitionRuntimeErrand(options: ErrandRuntimeStorageOptions, io: ErrandRecordIO,
  request: OrdinaryErrandTransition, message: string, remote: string | null = "origin",
  landingCommit?: NonNullable<Links["landingCommit"]>): Promise<IdentityTransactionOutcome<OrdinaryErrandRecord | null>> {
  if (!options.store?.capabilities.stateOffBranch) return transactTransientIdentities(io, { remote, message, transform: ordinaryErrandTransform(request) });
  return transitionStoreErrand({ ...options, store: options.store, identity: io.identity,
    ...(landingCommit === undefined ? {} : { landingCommit }) }, request);
}
