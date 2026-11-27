/** Keeps the in-repo store in every process a test spawns whose subject is the in-repo implementation. */
import { afterEach, beforeEach, onTestFinished } from "vitest";
import { IN_REPO_STORE_OVERRIDE } from "../../src/lib/store/selection.js";

const overrides: { previous: string | undefined; finished: boolean }[] = [];

function writeOverride(value: string | undefined): void {
  if (value === undefined) Reflect.deleteProperty(process.env, IN_REPO_STORE_OVERRIDE);
  else process.env[IN_REPO_STORE_OVERRIDE] = value;
}

function setOverride(value: string | undefined): () => void {
  const scope = { previous: process.env[IN_REPO_STORE_OVERRIDE], finished: false };
  overrides.push(scope);
  writeOverride(value);
  return () => {
    scope.finished = true;
    // A scoped operation can finish while an override it started still belongs to the running test.
    for (let latest = overrides.at(-1); latest?.finished; latest = overrides.at(-1)) {
      overrides.pop();
      writeOverride(latest.previous);
    }
  };
}

/** Set the in-repo store override for the running test, so the built CLI it spawns, and every Git hook that CLI or
 * the test's own `git` runs, builds the in-repo store; the environment is restored when the test finishes.
 */
export function useInRepoStore(): void {
  const restore = setOverride("1");
  onTestFinished(() => { restore(); });
}

/** Run an operation with the in-repo store override set, restoring the environment afterwards, for a fixture a file
 * builds once, before any test, whose subject is the in-repo implementation.
 * @param operation - The operation to run under the override.
 * @returns The operation's result.
 */
export async function withInRepoStore<T>(operation: () => Promise<T>): Promise<T> {
  const restore = setOverride("1");
  try { return await operation(); }
  finally { restore(); }
}

/** Run an operation with the in-repo store override cleared, restoring it afterwards, so it composes the default
 * store whatever the test around it selects.
 * @param operation - The operation to run without the override.
 * @returns The operation's result.
 */
export async function withoutInRepoStore<T>(operation: () => Promise<T>): Promise<T> {
  const restore = setOverride(undefined);
  try { return await operation(); }
  finally { restore(); }
}

/** Set the in-repo store override around every test in the enclosing file or `describe` block, its own `beforeEach`
 * fixtures included when registered before them.
 */
export function useInRepoStoreForEach(): void {
  let restore: (() => void) | undefined;
  beforeEach(() => { restore = setOverride("1"); });
  afterEach(() => { restore?.(); restore = undefined; });
}
