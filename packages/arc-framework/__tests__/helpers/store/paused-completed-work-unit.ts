/** Persisted completed pause evidence for namesake selection regressions. */
import { ArchiveQuarterSchema, SlugSchema } from "../../../src/lib/kernel/index.js";
import { recordPut } from "../../../src/lib/store/lifecycle-write.js";
import { writeMetaPause } from "../../../src/lib/store/kinds/meta/writers.js";
import { lifecycleSuccess, type createLifecycleHarness } from "./lifecycle-harness.js";

/** Seed a completed generation whose retained pause must not govern its live namesake. */
export async function seedPausedCompletedWorkUnit(h: ReturnType<typeof createLifecycleHarness>, slug: string) {
  const prior = await h.seedMeta(slug, { state: "Shipped", currentWorkflow: null },
    { kind: "completed", quarter: ArchiveQuarterSchema.parse("2026-q4") });
  lifecycleSuccess(await h.store.write({ ...recordPut(prior, { content: writeMetaPause(prior.content, {
    pausedBy: SlugSchema.parse("test-user"), since: "2026-10-14T00:00:00Z", reason: "Retained pause", waitsOn: null, resumeNotes: null, open: false,
  }) }), provenance: { verb: "pause", lifecycleAction: "pause" } }));
  return lifecycleSuccess(await h.store.read({ reference: prior.reference }));
}
