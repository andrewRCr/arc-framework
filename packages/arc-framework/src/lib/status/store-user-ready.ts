/** Derive identity-scoped Ready rows from the shared project acquisition and tier classification. */
import { readStoreProjectViewInput, type ReadStoreProjectViewOptions } from "./store-project-input.js";
import { classifyProjectReadinessRecords, type ProjectReadinessWarning } from "./project-view.js";
import type { StatusViewRow } from "./render.js";
import type { StatusViewResult } from "./store-view-result.js";
import { isMine } from "./ready-mine.js";

/** Operational project inputs plus the identity whose Ready work is requested. */
export interface StoreUserReadyOptions extends ReadStoreProjectViewOptions { identity: string | null }
/** Ready rows and the structured diagnostics retained from project acquisition and classification. */
export interface StoreUserReadySlice { rows: StatusViewRow[]; warnings: ProjectReadinessWarning[] }

/** Read ready work without introducing a second readiness policy. */
export async function readStoreUserReady(options: StoreUserReadyOptions): Promise<StatusViewResult<StoreUserReadySlice>> {
  const input = await readStoreProjectViewInput(options);
  if (input.status === "refused") return input;
  const tiers = classifyProjectReadinessRecords(input.result);
  const rows: StatusViewRow[] = tiers.ready.filter(record => isMine(record.owner, options.identity)).map(record => ({
    workUnit: record.slug, state: "Planning", dependsOn: [], priority: record.priority,
    ...(record.class === undefined ? {} : { class: record.class }),
    ...(record.cohort === undefined ? {} : { cohort: record.cohort }),
  }));
  return { status: "ok", result: { rows, warnings: [...input.result.sourceWarnings, ...tiers.warnings] } };
}
