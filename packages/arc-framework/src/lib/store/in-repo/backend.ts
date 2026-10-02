/** Registry-directed adapter over the checkout's operational records. */

import { ArcError } from "../../kernel/errors.js";
import type { Store } from "../contract.js";
import type { StorePorts } from "../ports.js";
import { createInRepoContext } from "./context.js";
import { readTracked } from "./read.js";
import { runOperation, notFound, unsupported } from "./refusals.js";
import { stateVersion, trackedHistory, trackedChanges } from "./history.js";
import { lookupTracked } from "./lookup.js";
import { listTracked } from "./list.js";
import type { ListInput, ListingOutcome } from "../read.js";
import { writeTracked, batchTracked } from "./write.js";
import type { WriteInput, WriteResult, BatchInput, BatchResult } from "../write.js";
import type { InRepoContext } from "./context.js";
import type { ReadInput, StoreRecord } from "../read.js";
import type { LookupInput, LookupResult } from "../lookup.js";
import type { RecordReference } from "../identity.js";
import type { HistoryEntry } from "../contract.js";

/** Assemble the substrate operations without observing their dependencies.
 * @param ports - The composition point's explicit dependencies.
 * @returns A store whose operations acquire only the dependencies they need.
 */
export function createInRepoBackend(ports: StorePorts): Store {
  const context = createInRepoContext(ports);
  return {
    capabilities: { stateOffBranch: false },
    read: (input) => runOperation(() => dispatchedRead(context, input)),
    list: (input) => runOperation(() => dispatchedList(context, input)),
    write: (input) => runOperation(() => dispatchedWrite(context, input)),
    batch: (input) => runOperation(() => dispatchedBatch(context, input)),
    version: () => runOperation(() => stateVersion(context)),
    history: (input) => runOperation(() => dispatchedHistory(context, input)),
    changes: (input) => runOperation(() => trackedChanges(context, input)),
    lookup: (input) => runOperation(() => dispatchedLookup(context, input)),
    sync: () => runOperation(async () => (await import("./sync.js")).syncInRepo(context)),
  };
}
async function dispatchedWrite(context: InRepoContext, input: WriteInput): Promise<WriteResult> {
  const home = context.registry[input.reference.kind].inRepo.substrate;
  if (home === "personal") return (await import("./personal-write.js")).writePersonal(context, input);
  if (home === "transient-identity") return (await import("./transient-write.js")).writeTransient(context, input);
  return writeTracked(context, input);
}
async function dispatchedBatch(context: InRepoContext, input: BatchInput): Promise<BatchResult> {
  const homes = new Set(input.writes.map((write) => context.registry[write.reference.kind].inRepo.substrate));
  if (homes.has("none")) return unsupported("unhomed-kind", "A requested kind has no home before the flip", "Keep using the existing verb for this record until it is rerouted.");
  if (homes.size > 1) return unsupported("cross-substrate-batch", "This batch spans the interim substrates",
    "Split the batch by substrate and use a backend currently serving each one, preserving the verb's existing order and idempotent retries.");
  if (homes.has("personal")) return (await import("./personal-write.js")).batchPersonal(context, input);
  if (homes.has("transient-identity")) return (await import("./transient-write.js")).batchTransient(context, input);
  if (!homes.has("tracked")) throw new ArcError("This batch substrate is not implemented", "store.not-implemented");
  return batchTracked(context, input);
}
async function dispatchedList(context: InRepoContext, input: ListInput): Promise<ListingOutcome> {
  if (input.family === "work-item" && input.kind === undefined) return unsupported("work-item-kind-required",
    "The interim work-item substrates must be listed one kind at a time", "List each work-item kind separately.");
  if (input.kind !== undefined) {
    const home = context.registry[input.kind].inRepo.substrate;
    if (home === "none") return { status: "absent", ...(input.asOf === undefined ? {} : { asOf: input.asOf }) };
    if (home === "personal") return (await import("./personal.js")).listPersonal(context, input);
    if (home === "transient-identity") return (await import("./transient-read.js")).listTransient(context, input);
  }
  if (input.kind === undefined && input.family === "personal") return (await import("./personal.js")).listPersonal(context, input);
  if (input.kind === undefined && input.family === "claims") return (await import("./transient-read.js")).listTransient(context, input);
  return listTracked(context, input);
}
async function dispatchedRead(context: InRepoContext, input: ReadInput): Promise<StoreRecord> {
  const home = context.registry[input.reference.kind].inRepo.substrate;
  if (home === "none") return notFound(input.reference);
  if (home !== "tracked") {
    if (input.asOf !== undefined) return unsupported("uncovered-state-version", "This record is outside the branch's saved state", "Read the record using its own per-record version instead.");
    if (home === "personal") return (await import("./personal.js")).readPersonal(context, input);
    return (await import("./transient-read.js")).readTransient(context, input);
  }
  return readTracked(context, input);
}
async function dispatchedHistory(context: InRepoContext, input: { reference: RecordReference }): Promise<HistoryEntry[]> {
  if (context.registry[input.reference.kind].inRepo.substrate === "transient-identity") {
    return (await import("./transient-history.js")).transientHistory(context, input);
  }
  return trackedHistory(context, input);
}
async function dispatchedLookup(context: InRepoContext, input: LookupInput): Promise<LookupResult> {
  if ((input.kind === "claim" && input.claim.kind !== "work-unit") || input.kind === "ref" || input.kind === "slug") {
    const found = await (await import("./transient-lookup.js")).lookupTransient(context, input);
    if (found !== null) return found;
  }
  return lookupTracked(context, input);
}
