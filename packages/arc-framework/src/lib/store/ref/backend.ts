/** Entry point for the ref-backed operational state implementation. */

import type { Store } from "../contract.js";
import type { RefStorePorts } from "../ports.js";
import { createRefBackendContext } from "./context.js";
import { refStateVersion } from "./manifest.js";
import { readSnapshotRecord, listSnapshotRecords } from "./snapshot-read.js";
import { readRefRecord, listRefRecords } from "./read.js";
import { writeRefRecord, batchRefRecords } from "./write.js";
import { historyRefRecord } from "./history.js";
import { changesRefRecords } from "./changes.js";
import { lookupRefRecord } from "./lookup.js";
import { pushRefStore } from "./push.js";
import { pullRefStore } from "./pull.js";
import { maintainRefStore } from "./maintain.js";

/** Construct the backend with no commands, file reads, or resolved policy ports. */
export function createRefBackend(ports: RefStorePorts): Store {
  const context = createRefBackendContext(ports);
  return {
    capabilities: { stateOffBranch: true },
    read: (input) => input.asOf ? readSnapshotRecord(context, input) : readRefRecord(context, input),
    list: (input) => input.asOf ? listSnapshotRecords(context, input) : listRefRecords(context, input),
    write: (input) => writeRefRecord(context, input), batch: (input) => batchRefRecords(context, input),
    version: async () => ({ status: "ok", result: await refStateVersion(context) }),
    history: (input) => historyRefRecord(context, input), changes: (input) => changesRefRecords(context, input), lookup: (input) => lookupRefRecord(context, input),
    pull: (input) => pullRefStore(context, input),
    push: (input) => pushRefStore(context, input), maintain: () => maintainRefStore(context),
  };
}
