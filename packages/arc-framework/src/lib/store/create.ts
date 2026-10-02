/** The sole composition point for operational state backends. */

import type { Store } from "./contract.js";
import type { StorePorts } from "./ports.js";

/** Construct a lazy store without reading configuration, files, or Git topology.
 * @param ports - Explicit file, Git, policy, clock, and write-lock dependencies.
 * @returns The operational state contract over the checkout's current substrates.
 */
export function createStore(ports: StorePorts): Store {
  let backend: Promise<Store> | undefined;
  const get = (): Promise<Store> => backend ??= import("./in-repo/backend.js")
    .then(({ createInRepoBackend }) => createInRepoBackend(ports));
  return {
    capabilities: { stateOffBranch: false },
    read: async (input) => (await get()).read(input),
    list: async (input) => (await get()).list(input),
    write: async (input) => (await get()).write(input),
    batch: async (input) => (await get()).batch(input),
    version: async () => (await get()).version(),
    history: async (input) => (await get()).history(input),
    changes: async (input) => (await get()).changes(input),
    lookup: async (input) => (await get()).lookup(input),
    sync: async () => (await get()).sync(),
  };
}
