/** Compose the store-backed project view from one completeness-preserving lifecycle observation. */
import type { Store } from "../store/contract.js";
import { readLifecycleView } from "../store/lifecycle-view.js";
import { PROJECT_READINESS_TITLE, type ComposeProjectReadinessViewOptions } from "./project-view.js";
import type { StatusViewResult } from "./store-view-result.js";
import { selectStandingLifecycleEntries } from "./store-project-standing.js";
import { readStoreProjectRecords } from "./store-project-records.js";
import { resolveStoreProjectDependencies } from "./store-project-dependencies.js";
import { readStoreProjectPauseMarks } from "./store-project-pauses.js";
import { listingDiagnosticWarnings } from "./store-project-diagnostics.js";

/** The composer fields supplied by store acquisition, without repository-file freshness. */
export type StoreProjectViewInput = Required<Pick<ComposeProjectReadinessViewOptions,
  "title" | "records" | "dependencyResolutions" | "pausedMarks" | "sourceWarnings">>;

/** Operational store, configured pause-review age, and optional clock observation. */
export interface ReadStoreProjectViewOptions {
  store: Store;
  reviewAfterDays: number;
  now?: Date;
}

/** Acquire the complete project input or retain the lifecycle inventory's refusal. */
export async function readStoreProjectViewInput(options: ReadStoreProjectViewOptions): Promise<StatusViewResult<StoreProjectViewInput>> {
  const view = await readLifecycleView(options.store);
  if (view.status === "refused") return { status: "refused", refusal: {
    code: view.refusal.code, condition: view.refusal.condition, remedy: view.refusal.remedy,
  } };
  if (view.result.listing.status === "unreadable") return { status: "refused", refusal: {
    code: "listing-unreadable", condition: view.result.listing.condition, remedy: view.result.listing.remedy,
  } };
  const diagnostics = view.result.listing.status === "complete" ? view.result.listing.diagnostics : [];
  const selected = selectStandingLifecycleEntries(view.result.entries, diagnostics);
  const [records, dependencyResolutions, pauses] = await Promise.all([
    readStoreProjectRecords(options.store, selected.entries),
    resolveStoreProjectDependencies({ store: options.store, entries: view.result.entries,
      standingEntries: selected.entries, failClosedNames: selected.failClosedNames }),
    readStoreProjectPauseMarks({ ...options, entries: selected.entries }),
  ]);
  return { status: "ok", result: { title: PROJECT_READINESS_TITLE, records: records.records, dependencyResolutions,
    pausedMarks: pauses.marks, sourceWarnings: [...listingDiagnosticWarnings(diagnostics),
      ...selected.warnings, ...records.warnings, ...pauses.warnings] } };
}
