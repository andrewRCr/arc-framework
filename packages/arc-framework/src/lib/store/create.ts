/** The sole composition point for operational state backends. */

import type { Store, ReadOnlyStore } from "./contract.js";
import type { StoreMigrateInput, StoreMigrateResult, StoreRemoteInput, StoreRemoteResult } from "./commands.js";
import type { StorePorts, RefStorePorts } from "./ports.js";

/** Construct a lazy store without reading configuration, files, or Git topology.
 * @param ports - Explicit file, Git, policy, clock, and write-lock dependencies.
 * @returns The operational state contract over the checkout's current substrates.
 */
export function createStore(ports: StorePorts): Store {
  return lazyStore(false, () => import("./in-repo/backend.js")
    .then(({ createInRepoBackend }) => createInRepoBackend(ports)));
}

/** Construct the dark ref backend without consulting any dependency. */
export function createRefStore(ports: RefStorePorts): Store {
  return lazyStore(true, () => import("./ref/backend.js")
    .then(({ createRefBackend }) => createRefBackend(ports)));
}

/** Construct a lazy read-only view of one remote's acquired project state. */
export function createReadSourceStore(ports: RefStorePorts, remote: string): ReadOnlyStore {
  return lazyReadStore(true, () => import("./ref/backend.js")
    .then(({ createRefReadSourceBackend }) => createRefReadSourceBackend(ports, remote)));
}

function lazyStore(stateOffBranch: boolean, construct: () => Promise<Store>): Store {
  let backend: Promise<Store> | undefined;
  const get = (): Promise<Store> => backend ??= construct();
  return {
    ...lazyReadStore(stateOffBranch, get),
    write: async (input) => (await get()).write(input),
    batch: async (input) => (await get()).batch(input),
    push: async (input) => (await get()).push(input),
    pull: async (input) => (await get()).pull(input),
    maintain: async () => (await get()).maintain(),
  };
}

function lazyReadStore(stateOffBranch: boolean, construct: () => Promise<ReadOnlyStore>): ReadOnlyStore {
  let backend: Promise<ReadOnlyStore> | undefined;
  const get = (): Promise<ReadOnlyStore> => backend ??= construct();
  return {
    capabilities: { stateOffBranch },
    read: async (input) => (await get()).read(input),
    list: async (input) => (await get()).list(input),
    version: async () => (await get()).version(),
    history: async (input) => (await get()).history(input),
    changes: async (input) => (await get()).changes(input),
    lookup: async (input) => (await get()).lookup(input),
  };
}

/** Run an explicit migration against the ref backend, independently of operational backend selection. */
export async function runStoreMigrate(ports: RefStorePorts, input: StoreMigrateInput = {}): Promise<StoreMigrateResult> {
  const { runRefBackendMigrate } = await import("./ref/backend.js");
  return runRefBackendMigrate(ports, input);
}

/** Inspect or set ref-store roles, performing any layout move required by that setting. */
export async function runStoreRemote(ports: RefStorePorts, input: StoreRemoteInput = {}): Promise<StoreRemoteResult> {
  const { runRefBackendRemote } = await import("./ref/backend.js");
  return runRefBackendRemote(ports, input);
}
