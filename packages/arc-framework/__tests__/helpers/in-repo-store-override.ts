/** Keeps the in-repo store in every process a test spawns whose subject is the in-repo implementation. */
import { afterEach, beforeEach, onTestFinished } from "vitest";
import { IN_REPO_STORE_OVERRIDE } from "../../src/lib/store/selection.js";

function setInRepoStoreOverride(): () => void {
  const previous = process.env[IN_REPO_STORE_OVERRIDE];
  process.env[IN_REPO_STORE_OVERRIDE] = "1";
  return () => {
    if (previous === undefined) Reflect.deleteProperty(process.env, IN_REPO_STORE_OVERRIDE);
    else process.env[IN_REPO_STORE_OVERRIDE] = previous;
  };
}

/** Set the in-repo store override for the running test, so the built CLI it spawns, and every Git hook that CLI or
 * the test's own `git` runs, builds the in-repo store; the environment is restored when the test finishes.
 */
export function useInRepoStore(): void {
  const restore = setInRepoStoreOverride();
  onTestFinished(() => { restore(); });
}

/** Set the in-repo store override around every test in the enclosing file or `describe` block, its own `beforeEach`
 * fixtures included when registered before them.
 */
export function useInRepoStoreForEach(): void {
  let restore: (() => void) | undefined;
  beforeEach(() => { restore = setInRepoStoreOverride(); });
  afterEach(() => { restore?.(); restore = undefined; });
}
