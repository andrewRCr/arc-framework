/** Entry point for the ref-backed operational state implementation. */

import type { z } from "zod";
import type { StoreConflictInput, StoreConflictResult, StoreMigrateInput, StoreMigrateResult, StoreRemoteInput, StoreRemoteResult } from "../commands.js";
import type { Store, ReadOnlyStore } from "../contract.js";
import type { RefStorePorts } from "../ports.js";
import type { StoreResult } from "../refusal.js";
import { PullInputSchema, PushInputSchema } from "../sync.js";
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
    pull: (input) => {
      const parsed = PullInputSchema.safeParse(input ?? {});
      return parsed.success ? operations.maintenance(() => pullRefStore(scoped(context), parsed.data)) : syncInputRefusal("pull", parsed.error);
    },
    push: (input) => {
      const parsed = PushInputSchema.safeParse(input ?? {});
      return parsed.success ? operations.maintenance(() => pushRefStore(scoped(context), parsed.data)) : syncInputRefusal("push", parsed.error);
    },
    maintain: () => operations.maintenance(() => maintainRefStore(scoped(context))),
  };
}

// A history entry becomes a fetch refspec pattern, so a malformed one would widen or add to what the fetch prunes.
function syncInputRefusal(operation: "pull" | "push", error: z.ZodError): Promise<StoreResult<never>> {
  const issue = error.issues[0], operand = issue?.path.length ? issue.path.join(".") : "input";
  return Promise.resolve({ status: "refused", refusal: { code: "record-malformed", class: "recoverable", rule: `store.${operation}-input`,
    condition: `The ${operation} input's ${operand} is invalid: ${issue?.message ?? "it does not match the input shape"}.`,
    remedy: { text: operation === "pull"
      ? "Name each history as refs/arc/history/work/<uid> or refs/arc/history/cohort/<uid>, or omit it, then retry."
      : "Carry a non-empty code ref with an optional full commit lease, or omit the carry, then retry." } } });
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
    version: () => operations.read(async (reader) => ({ status: "ok", result: await refStateVersion(scoped(reader)) })),
    history: (input) => operations.read((reader) => historyRefRecord(scoped(reader), input)),
    changes: (input) => operations.read((reader) => changesRefRecords(scoped(reader), input)),
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
export async function runRefBackendConflict(ports: RefStorePorts, input: StoreConflictInput,
  writeNotice?: (line: string) => void): Promise<StoreConflictResult> {
  return runRefConflict(createRefBackend(ports), input, writeNotice);
}
