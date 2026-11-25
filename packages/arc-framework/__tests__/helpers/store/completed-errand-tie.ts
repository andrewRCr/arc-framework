/** Completed Errands sharing a slug through the production record write boundary. */
import type { createLifecycleHarness } from "./lifecycle-harness.js";
import { transientContent } from "./in-repo-substrates.js";
import { OwnerIdentitySchema, recordReferences } from "../../../src/lib/store/identity.js";
import { ArchiveQuarterSchema } from "../../../src/lib/kernel/index.js";

/** Seed an unordered completed tier that the slug lookup must leave ambiguous. */
export async function seedCompletedErrandTie(h: Pick<ReturnType<typeof createLifecycleHarness>, "seed">, slug: string): Promise<void> {
  const reference = recordReferences["work-item/record"](OwnerIdentitySchema.parse({ type: "work-item", name: slug }));
  for (let generation = 0; generation < 2; generation++) await h.seed(reference, transientContent(reference),
    { kind: "completed", quarter: ArchiveQuarterSchema.parse("2026-q4") });
}
