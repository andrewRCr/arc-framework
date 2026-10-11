/** Serialization follows the shared namespace, including reopened backend instances. */
import type { MemoryState } from "./model.js";

const queues = new WeakMap<MemoryState, Promise<void>>();

/** Hold one state's mutation queue until the operation settles, including thrown defects.
 * @param state - Shared state object, outside its cloneable payload.
 * @param operation - Mutation to execute after earlier operations finish.
 * @returns The mutation result or its original thrown defect.
 */
export async function withStateQueue<T>(state: MemoryState, operation: () => T | Promise<T>): Promise<T> {
  const predecessor = queues.get(state) ?? Promise.resolve();
  let release!: () => void;
  const tail = new Promise<void>((resolve) => { release = resolve; });
  queues.set(state, tail);
  await predecessor;
  try { return await operation(); }
  finally {
    release();
    if (queues.get(state) === tail) queues.delete(state);
  }
}
