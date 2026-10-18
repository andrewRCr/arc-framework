/** Seed-time and fresh task-list evidence for recovery progression. */
import { readFile } from "node:fs/promises";
import { isAbsolute, relative, resolve, sep } from "node:path";
import type { GitExec } from "../git/index.js";
import type { RecoveryTaskListEvidence } from "./integration-correction.js";
import type { Store } from "../store/contract.js";
import { recordReferences, type StateVersion } from "../store/identity.js";
import { identifyWorkUnitArtifactPath } from "../layout/index.js";
import { SlugSchema } from "../kernel/index.js";
import type { StoreSyncPort } from "../store/operational-sync.js";
import type { StoreRecord } from "../store/read.js";
import { readStateHistory } from "../handoff/state-history.js";

/** Resolve the same evidence over the selected substrate, retaining the code baseline.
 * @param input - Checkout, saved code/state anchors and current selected store.
 * @returns Exact saved and current task bytes, or an actionable unavailable result.
 */
export async function resolveRecoveryTaskListEvidence(input: {
  cwd: string;
  exec: GitExec;
  seedHead: string;
  taskListPath: string;
  store?: Store;
  stateVersion?: StateVersion | null;
  currentStateVersion?: StateVersion | null;
  sync?: StoreSyncPort;
}): Promise<RecoveryTaskListEvidence> {
  if (input.store?.capabilities.stateOffBranch === true) {
    try {
      const store = input.store;
      const identified = identifyWorkUnitArtifactPath(input.taskListPath);
      if (identified === null || identified.artifact !== "tasks") throw new Error(`No task-list record corresponds to ${input.taskListPath}. Repair the work unit's Task List reference and retry.`);
      if (input.stateVersion === null || input.stateVersion === undefined) throw new Error("The recovery seed has no state version. Rebuild the seed from current operational state and retry recovery.");
      const stateVersion = input.stateVersion;
      const current = input.currentStateVersion === undefined ? await readStateHistory(() => store.version(), input.sync) : input.currentStateVersion;
      if (current === null) throw new Error("Recovery has no current operational snapshot. Repair state availability and retry recovery.");
      const resolved = await readStateHistory(() => store.lookup({ kind: "slug", slug: SlugSchema.parse(identified.slug) }), input.sync);
      if (resolved.reference.kind !== "work-item/meta") throw new Error(`${identified.slug} is not a work unit. Resume recovery in the work unit's checkout.`);
      const reference = recordReferences["work-item/task-list"](resolved.reference.owner);
      const fresh = await readStateHistory(() => store.read({ reference, asOf: current }), input.sync);
      const seed = await readStateHistory<StoreRecord | null>(async () => {
        const result = await store.read({ reference, asOf: stateVersion });
        return result.status === "refused" && result.refusal.code === "not-found" ? { status: "ok" as const, result: null } : result;
      }, input.sync);
      return { status: "ok", seed: seed?.content ?? null, fresh: fresh.content };
    } catch (error) { return { status: "unavailable", message: errorMessage(error) }; }
  }
  let fresh: string;
  try {
    fresh = await readFile(recoveryTaskListPath(input.cwd, input.taskListPath), "utf8");
  } catch (error) {
    return {
      status: "unavailable",
      message: `fresh task-list progression evidence is unavailable: ${errorMessage(error)}`,
    };
  }

  let seed: string | null = null;
  try {
    // The current in-repo storage adapter resolves the seed-time snapshot from
    // Git. The audit core consumes only the injected snapshot pair.
    seed = (await input.exec("git", ["show", `${input.seedHead}:${input.taskListPath}`])).stdout;
  } catch {
    // A seed-tree miss remains explicit null evidence. Public-to-task progression
    // requires it; task closure can still be proven from the stored seed cursor.
  }
  return { status: "ok", seed, fresh };
}

function recoveryTaskListPath(cwd: string, taskListPath: string): string {
  const absolutePath = resolve(cwd, taskListPath);
  const relativePath = relative(cwd, absolutePath);
  if (relativePath.length === 0
    || relativePath === ".."
    || relativePath.startsWith(`..${sep}`)
    || isAbsolute(relativePath)) {
    throw new Error(`Task list path must be repository-relative: ${taskListPath}`);
  }
  return absolutePath;
}


function errorMessage(error: unknown): string { return error instanceof Error ? error.message : String(error); }
