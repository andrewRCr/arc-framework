/** Store reads used to choose and render a projection, independent of its writable destination. */
import type { Store } from "../contract.js";

/** Both a writable store and a read-only store satisfy this source without an adapter. */
export type ProjectionSource = Pick<Store, "read" | "list" | "version" | "changes">;

/** Retain a round's distinct source requests, including refused or failed reads. */
export function createProjectionReadMemo(source: ProjectionSource): ProjectionSource {
  let version: ReturnType<ProjectionSource["version"]> | undefined;
  return { read: memoizeQuery(source.read.bind(source)), list: memoizeQuery(source.list.bind(source)),
    changes: memoizeQuery(source.changes.bind(source)), version: () => version ??= source.version() };
}

function memoizeQuery<Input, Output>(read: (input: Input) => Promise<Output>): (input: Input) => Promise<Output> {
  const answers = new Map<string, Promise<Output>>();
  return input => {
    const key = JSON.stringify(input, (_key, value: unknown) => value !== null && typeof value === "object" && !Array.isArray(value)
      ? Object.fromEntries(Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)) : value);
    let answer = answers.get(key);
    if (answer === undefined) { answer = read(input); answers.set(key, answer); }
    return answer;
  };
}
