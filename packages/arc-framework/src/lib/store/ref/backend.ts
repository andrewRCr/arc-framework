/** Entry point for the ref-backed operational state implementation. */

import type { StoreConflictInput, StoreConflictResult, StoreMigrateInput, StoreMigrateResult, StoreRemoteInput, StoreRemoteResult } from "../commands.js";
import type { Store, ReadOnlyStore } from "../contract.js";
import type { RefStorePorts } from "../ports.js";
import { createRefBackendContext, type RefBackendContext } from "./context.js";
import { refStateVersion } from "./manifest.js";
import { readSnapshotRecord, listSnapshotRecords } from "./snapshot-read.js";
import { readRefRecord, listRefRecords } from "./read.js";
import { writeRefRecord, batchRefRecords } from "./write.js";
import { historyRefRecord } from "./history.js";
import { changesRefRecords } from "./changes.js";
import { lookupRefRecord } from "./lookup.js";
import { pushRefStore } from "./push.js";
import { pullRefStore } from "./pull.js";
import { readSourceContext } from "./read-source-namespace.js";
import { runRefMigrate, runRefRemote } from "./commands.js";
import { runRefConflict } from "./conflict-command.js";
import { createRefReadCoordinator } from "./read-operation.js";
import { maintainRefStore } from "./maintain.js";
import { withOperationIdentity as scoped } from "./operation-identity.js";

/** Construct the backend with no commands, file reads, or resolved policy ports. */
export function createRefBackend(ports: RefStorePorts): Store {
  const context = createRefBackendContext(ports);
  const operations = createRefReadCoordinator(context);
  return {
    ...refReadOperations(context, operations),
    write: (input) => operations.read((reader) => writeRefRecord(scoped(reader), input)),
    batch: (input) => operations.read((reader) => batchRefRecords(scoped(reader), input)),
    pull: (input) => operations.maintenance(() => pullRefStore(scoped(context), input)),
    push: (input) => operations.maintenance(() => pushRefStore(scoped(context), input)),
    maintain: () => operations.maintenance(() => maintainRefStore(scoped(context))),
  };
}

/** Construct the remote view without exposing any mutation or synchronization operation. */
export function createRefReadSourceBackend(ports: RefStorePorts, remote: string): ReadOnlyStore {
  return refReadOperations(readSourceContext(createRefBackendContext(ports), remote));
}

function refReadOperations(context: RefBackendContext, operations = createRefReadCoordinator(context)): ReadOnlyStore {
  return {
    capabilities: { stateOffBranch: true },
    read: (input) => operations.read((reader) => input.asOf ? readSnapshotRecord(scoped(reader), input) : readRefRecord(scoped(reader), input)),
    list: (input) => operations.read((reader) => input.asOf ? listSnapshotRecords(scoped(reader), input) : listRefRecords(scoped(reader), input)),
    version: async () => ({ status: "ok", result: await refStateVersion(scoped(context)) }),
    history: (input) => historyRefRecord(scoped(context), input), changes: (input) => changesRefRecords(scoped(context), input),
    lookup: (input) => operations.read((reader) => lookupRefRecord(scoped(reader), input)),
  };
}

/** Enter the ref backend's explicit migration command. */
export async function runRefBackendMigrate(ports: RefStorePorts, input: StoreMigrateInput): Promise<StoreMigrateResult> {
  return runRefMigrate(createRefBackendContext(ports), createRefBackend(ports), input);
}

/** Enter the ref backend's explicit designation command. */
export async function runRefBackendRemote(ports: RefStorePorts, input: StoreRemoteInput): Promise<StoreRemoteResult> {
  return runRefRemote(createRefBackendContext(ports), createRefBackend(ports), input);
}

/** Inspect an exact conflict without changing operational backend selection. */
export async function runRefBackendConflict(ports: RefStorePorts, input: StoreConflictInput): Promise<StoreConflictResult> {
  return runRefConflict(createRefBackend(ports), input);
}
