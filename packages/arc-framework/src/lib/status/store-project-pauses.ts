/** Acquire shared pause marks for the project view without reading identity or checkout state. */
import type { Store } from "../store/contract.js";
import { MetaPauseSchema } from "../active/meta-schema.js";
import { markPausedWorkItem } from "../session-init/paused-work.js";
import type { LifecycleEntry } from "../store/lifecycle-index.js";
import type { ProjectReadinessPauseMarks, ProjectReadinessWarning } from "./project-view.js";

/** One view's paused entries, configured review age, and optional clock observation. */
export interface StoreProjectPauseOptions {
  store: Store;
  entries: readonly LifecycleEntry[];
  reviewAfterDays: number;
  now?: Date;
}

/** Marks keyed by standing slug, with any unavailable marking evidence retained. */
export interface StoreProjectPauses {
  marks: ReadonlyMap<string, ProjectReadinessPauseMarks>;
  warnings: ProjectReadinessWarning[];
}

/** Mark each paused entry through the same function as the session-start slot. */
export async function readStoreProjectPauseMarks(options: StoreProjectPauseOptions): Promise<StoreProjectPauses> {
  const marks = new Map<string, ProjectReadinessPauseMarks>();
  const warnings: ProjectReadinessWarning[] = [];
  for (const entry of options.entries) {
    if (entry.fields.pause === null) continue;
    try {
      const result = await markPausedWorkItem({ slug: entry.reference.owner.name, pause: MetaPauseSchema.parse(entry.fields.pause) },
        { store: options.store, reviewAfterDays: options.reviewAfterDays, ...(options.now === undefined ? {} : { now: options.now }) });
      marks.set(entry.reference.owner.name, result.marks);
    } catch (error) {
      warnings.push({ code: "store-read-failed", workUnit: entry.reference.owner.name,
        rendered: error instanceof Error ? error.message : String(error) });
    }
  }
  return { marks, warnings };
}
