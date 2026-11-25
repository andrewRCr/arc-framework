/** The pieces an operational store selection composes: the in-repo override, the ref backend's ports, and the refusal
 * that keeps a ref store from opening over a checkout whose branch still tracks ARC state. */

import type { GitExec } from "../git/exec.js";
import { isGitProcessError } from "../git/process-error.js";
import { PROJECTED_LIFECYCLE_PATTERNS } from "../layout/index.js";
import type { Store } from "./contract.js";
import type { RefStorePorts, StorePorts } from "./ports.js";
import type { StoreRefusal } from "./refusal.js";

/** The environment variable that, set and non-empty, selects the in-repo implementation. */
export const IN_REPO_STORE_OVERRIDE = "ARC_IN_REPO_STORE";

/** The roots under which a tracked file means the branch still carries state the ref store keeps. */
export const TRACKED_STATE_ROOTS: readonly string[] = [...PROJECTED_LIFECYCLE_PATTERNS,
  ".arc/system/.internal/candidates/", ".arc/system/.internal/transitions/"];

/** The refusal a ref store composed over a tree that tracks ARC state returns from every operation. */
export type TrackedStateRefusal = Extract<StoreRefusal, { code: "tracked-state" }>;

/** Compose the ref backend's ports from an operational store caller's ports.
 * @param ports - The caller's ports. Its Git executors pass the Git floor gate. Its file access, clock, and identity
 *   carry over. Its remote and locks have no place: the ref backend takes its remotes from their designation and
 *   serializes its writes through its own ref lock.
 * @returns Ref ports bound to the caller's checkout, reading its backing pointer only at a destination decision.
 */
export async function composeRefStorePorts(ports: StorePorts): Promise<RefStorePorts> {
  const [{ createDefaultRefStorePorts }, { readBackingRepository }] = await Promise.all([
    import("./default-ports.js"), import("../config/status-reader.js")]);
  const { checkoutRoot } = ports;
  const base = createDefaultRefStorePorts({ checkoutRoot, exec: ports.exec, execInput: ports.execInput, fs: ports.fs,
    backingRepository: () => readBackingRepository(checkoutRoot) });
  return { ...base, clock: ports.clock, identity: ports.identity };
}

/** Find the state roots under which `HEAD`'s tree tracks a file, reading from the repository's top level whatever the
 * checkout's depth. The index is not read, so a staged deletion still counts until it is committed.
 * @param exec - Git executor run in the checkout.
 * @returns The roots tracked, in their fixed order: none for an unborn `HEAD` or outside a Git repository. Any other Git
 *   failure throws.
 */
export async function findTrackedStateRoots(exec: GitExec): Promise<string[]> {
  let tree: string;
  try {
    tree = (await exec("git", ["rev-parse", "--verify", "--quiet", "HEAD^{tree}"],
      { diagnosticLocale: "stable", objectAccess: "local-only" })).stdout.trim();
  } catch (error) {
    if (!isGitProcessError(error) || error.kind !== "nonzero-exit") throw error;
    if (error.exitCode === 128 && /not a git repository/iu.test(error.stderr)) return [];
    if (error.exitCode !== 1 || !await isUnbornHead(exec)) throw error;
    return [];
  }
  const listed = (await exec("git", ["ls-tree", "-z", "--full-tree", "--name-only", tree, "--", ...TRACKED_STATE_ROOTS],
    { clearPathspecEnvironment: true, objectAccess: "local-only" })).stdout.split("\0");
  return TRACKED_STATE_ROOTS.filter((root) => listed.some((path) => path.startsWith(root)));
}

async function isUnbornHead(exec: GitExec): Promise<boolean> {
  let branch: string;
  try {
    branch = (await exec("git", ["symbolic-ref", "--quiet", "--no-recurse", "HEAD"],
      { objectAccess: "local-only" })).stdout.trim();
  } catch (error) {
    if (isGitProcessError(error) && error.kind === "nonzero-exit" && error.exitCode === 1) return false;
    throw error;
  }
  if (!branch.startsWith("refs/heads/")) return false;
  try {
    await exec("git", ["show-ref", "--exists", branch], { objectAccess: "local-only" });
    return false;
  } catch (error) {
    if (isGitProcessError(error) && error.kind === "nonzero-exit" && error.exitCode === 2) return true;
    throw error;
  }
}

/** Build the tracked-state refusal, its remedy chosen by whether this repository holds an imported store locally.
 * @param exec - Git executor run in the checkout; it reads no remote.
 * @param roots - The tracked state roots found.
 */
export async function trackedStateRefusal(exec: GitExec, roots: readonly string[]): Promise<TrackedStateRefusal> {
  const { storeImportedHere } = await import("./store-imported.js");
  const paths = TRACKED_STATE_ROOTS.join(" ");
  const fromTop = "Run the Git commands below from the repository's top level (`git rev-parse --show-toplevel`). "
    + "Before listing or removing state, clear `GIT_ICASE_PATHSPECS` if set (`unset GIT_ICASE_PATHSPECS` in a POSIX shell).\n";
  const steps = "On `main`, merge the updated base (`git merge origin/main`), rebuild ARC, and run the command again.\n"
    + "On any other live branch, use the cutover window's `compare --branch` step to compare the local and host tips against "
    + "the cutover record and record any moved ranges. Merge any host-only commits into the local branch first. "
    + `Then remove tracked state from disk and the index (\`git rm -r --ignore-unmatch -- ${paths}\`). `
    + "Check for copies of the removed files left on disk. Save any wanted edits elsewhere and remove those copies before committing. "
    + "Commit the deletion, merge the updated base (`git merge origin/main`), rebuild ARC, and push the branch. "
    + "Follow the cutover window's checkout steps for personal digest comparison, materialization, handling withheld "
    + "personal files, and binding the pre-flip marker before reapplying the recorded state changes through the store, "
    + "then confirm each replayed range at its exact tip and run the command again.";
  const text = await storeImportedHere(exec)
    ? `This repository's store has been imported.\n${fromTop}`
      + `Run \`git fetch origin\` before continuing with the updated base.\n${steps}`
    : "No imported store is present here, which may only mean it has not been fetched.\n" + fromTop
      + "Run `git fetch origin` and check "
      + "whether its base branch still tracks ARC state (for example "
      + `\`git ls-tree -r --full-tree --name-only origin/main -- ${paths}\`). `
      + "If the listing still shows state, import it with the build of ARC that wrote it (`arc store migrate --import`), "
      + `then run the command again. If the listing succeeds and is empty, follow these steps.\n${steps}`;
  return { code: "tracked-state", class: "recoverable", roots: [...roots],
    condition: `This checkout's HEAD tracks ARC state under ${roots.join(", ")}, which this build of ARC keeps in its `
      + "store rather than on the branch.", remedy: { text } };
}

/** The tracked-state refusal for a checkout whose `HEAD` tracks ARC state, or null where it tracks none. */
export async function findTrackedStateRefusal(exec: GitExec): Promise<TrackedStateRefusal | null> {
  const roots = await findTrackedStateRoots(exec);
  return roots.length === 0 ? null : trackedStateRefusal(exec, roots);
}

/** A ref-capable store that returns one refusal from every operation, writing nothing. */
export function refusingStore(refusal: StoreRefusal): Store {
  const refused = (): Promise<{ status: "refused"; refusal: StoreRefusal }> => Promise.resolve({ status: "refused", refusal });
  return { capabilities: { stateOffBranch: true }, read: refused, list: refused, write: refused, batch: refused,
    version: refused, history: refused, changes: refused, lookup: refused, push: refused, pull: refused, maintain: refused };
}
