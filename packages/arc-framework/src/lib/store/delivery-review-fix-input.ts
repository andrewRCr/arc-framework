/** Completed lifecycle coordinates retained for delivery's authenticated review-fix owner. */
import { readdir, readFile } from "node:fs/promises";
import type { Store } from "./contract.js";
import { parseMetaFile } from "../active/meta-reader.js";
import { resolveTaskListPath } from "../../commands/active/status.js";
import { resolve } from "node:path";
import { readStoredDeliveryEntryInput } from "./delivery-entry-input.js";
import type { OwnerIdentity } from "./identity.js";
import { readWorkUnit, workUnitMetaPath } from "./lifecycle-write.js";
import { unwrapReviewRecordResult } from "./kinds/review/access-shared.js";
import { readReviewWorkUnitByRef } from "./review-work-unit.js";
import type { StoreRecord } from "./read.js";
import { buildLifecycleIndex } from "../work-unit/lifecycle-index.js";

/** How a native read selects one generation of a slug that a live namesake or another ended item may share. */
export interface CompletedDeliverySelection {
  /** The exact generation an invocation already bound. */
  owner?: OwnerIdentity;
  /** The checkout's branch, which links exactly one generation where the slug alone may not. */
  branch?: string | null;
  projectId?: () => Promise<string>;
}

async function readSelectedPrimary(store: Store, name: string, selection: CompletedDeliverySelection): Promise<StoreRecord | null> {
  if (selection.owner !== undefined) return unwrapReviewRecordResult(store, await readWorkUnit(store, name, selection.owner));
  if (selection.branch !== undefined && selection.branch !== null) {
    const linked = await readReviewWorkUnitByRef({ store, projectId: selection.projectId }, selection.branch);
    if (linked !== null) return linked.name === name ? linked.record : null;
  }
  return unwrapReviewRecordResult(store, await readWorkUnit(store, name));
}

/** Confirm a completed owner and report its metadata coordinate without reading a projected native file. */
export async function readCompletedDeliveryLocus(store: Store, cwd: string, name: string, selection: CompletedDeliverySelection = {}):
  Promise<{ name: string; path: string; workItem?: OwnerIdentity } | null> {
  if (store.capabilities.stateOffBranch) {
    const primary = await readSelectedPrimary(store, name, selection);
    return primary?.placement?.kind === "completed"
      ? { name: primary.reference.owner.name, path: workUnitMetaPath(primary), workItem: primary.reference.owner } : null;
  }
  const index = await buildLifecycleIndex({ cwd, fs: {
    readdir: path => readdir(path, { withFileTypes: true }), readFile: path => readFile(path, "utf8"),
  } });
  const completed = index.get(name);
  return completed?.location === "completed" ? { name, path: completed.path } : null;
}

/** Read the task binding for one selected review-fix owner, retaining its exact native identity. */
export async function readDeliveryReviewFixTaskInput(store: Store, cwd: string, locus: { name: string; path: string },
  owner?: OwnerIdentity): Promise<{ taskListPath: string | null; workItem?: OwnerIdentity }> {
  if (store.capabilities.stateOffBranch) {
    const stored = unwrapReviewRecordResult(store, await readStoredDeliveryEntryInput(store, locus.name, owner));
    return { taskListPath: stored.taskListPath, workItem: stored.primary.reference.owner };
  }
  const meta = parseMetaFile(await readFile(resolve(cwd, locus.path), "utf8"));
  return { taskListPath: meta.taskList === null || meta.taskList === "[none]" ? null : resolveTaskListPath(locus.path, meta.taskList) };
}
