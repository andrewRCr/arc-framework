/** Validate the repository's placement of declared checks in CI jobs. */
import type { DeclaredCheckResult } from "../handlers/check/run.js";
import { z } from "zod";

export const CheckPlumbingSchema = z.record(z.string(), z.array(z.strictObject({
  job: z.string().min(1), step: z.string().min(1),
})).min(1));

const WorkflowSchema = z.object({ jobs: z.record(z.string(), z.object({
  steps: z.array(z.object({ id: z.string().optional() })),
  strategy: z.object({ matrix: z.object({ shard: z.unknown().optional() }) }).optional(),
})) });

/** Concrete workflow step destinations keyed by declaration id. */
export type CheckPlumbing = Record<string, Array<{ job: string; step: string }>>;

/**
 * Refuse stale check ids, missing steps, and inconsistent shard matrices.
 * @param checks - Merge-gate invocation forecast
 * @param plumbing - Repository-authored destinations
 * @param workflow - Parsed workflow document
 * @returns Nothing when every placement is valid
 */
export function validateCheckPlumbing(checks: readonly DeclaredCheckResult[], plumbing: CheckPlumbing, workflow: unknown): void {
  const jobs = WorkflowSchema.parse(workflow).jobs;
  for (const [id, destinations] of Object.entries(plumbing)) {
    const check = checks.find(check => check.id === id);
    if (!check) throw new Error(`CI map names an unlisted check: ${id}`);
    for (const destination of destinations) {
      const job = jobs[destination.job];
      if (!job?.steps.some(step => step.id === destination.step)) {
        throw new Error(`CI map for ${id} names a missing step: ${destination.job}/${destination.step}`);
      }
      if (check.shards !== undefined) {
        const expected = check.shards.map(shard => shard.index);
        if (JSON.stringify(job.strategy?.matrix.shard) !== JSON.stringify(expected)) {
          throw new Error(`CI shard matrix for ${id} in ${destination.job} must be ${expected.join(", ")}`);
        }
      }
    }
  }
}
