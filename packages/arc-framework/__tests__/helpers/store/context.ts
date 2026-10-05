/** Injected registry, identity, clock and durable state for the test reference implementation. */

import { KIND_REGISTRY, type KindDefinition, type KindId } from "../../../src/lib/store/index.js";
import { createMemoryState, type MemoryState } from "./model.js";
import type { ReferencePublication } from "./sync.js";

/** Runtime configuration shared by reopened instances; the clock is an observable boundary. */
export interface ReferenceEnvironment { identity: string | undefined; actor: string; now(): number; wait(milliseconds: number): void }
/** Constructor inputs for an isolated or reopened reference namespace. */
export interface ReferenceBackendOptions {
  state?: MemoryState;
  environment?: ReferenceEnvironment;
  registry?: Readonly<Record<KindId, KindDefinition>>;
  publication?: ReferencePublication;
}
/** Common dependencies passed explicitly into each behavior module. */
export interface ReferenceContext {
  state: MemoryState;
  environment: ReferenceEnvironment;
  registry: Readonly<Record<KindId, KindDefinition>>;
  publication: ReferencePublication;
}

/** Create an independently configured context without a process-global store.
 * @param options - Shared state and registry when opening an existing namespace.
 * @returns The complete dependencies of local reference operations.
 */
export function createReferenceContext(options: ReferenceBackendOptions): ReferenceContext {
  return {
    state: options.state ?? createMemoryState(), registry: options.registry ?? KIND_REGISTRY,
    environment: options.environment ?? { identity: "test-user", actor: "local", now: () => 0, wait: () => {} },
    publication: options.publication ?? { base: new Map() },
  };
}
