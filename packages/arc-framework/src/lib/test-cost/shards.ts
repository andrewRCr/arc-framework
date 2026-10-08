/** Literal CI shard indices and exact whole-tier native membership validation. */
import yaml from "js-yaml";
import { z } from "zod";

export interface E2EShardMembership {
  readonly wholeTier: readonly string[];
  readonly legs: readonly { readonly shard: number; readonly files: readonly string[] }[];
}

/**
 * Read literal E2E shard indices from the workflow.
 * @param workflow - CI workflow YAML
 * @returns Contiguous one-based shard indices
 */
export function parseWorkflowE2EShards(workflow: string): number[] {
  const parsed = z.object({ jobs: z.object({ e2e: z.object({ strategy: z.object({
    matrix: z.object({ shard: z.array(z.number().int().positive()).min(2) }),
  }) }) }) }).parse(yaml.load(workflow));
  const shards = parsed.jobs.e2e.strategy.matrix.shard;
  if (shards.some((shard, index) => shard !== index + 1)) {
    throw new Error("CI E2E shards must be contiguous one-based indices");
  }
  return shards;
}

/**
 * Validate that native collection covers every E2E file on exactly one shard.
 * @param wholeTier - Complete native E2E file set
 * @param legs - Native collected membership for each shard
 * @returns Normalized whole-tier and per-shard membership
 */
export function validateE2EShardMembership(wholeTier: readonly string[], legs: readonly (readonly string[])[]): E2EShardMembership {
  const whole = [...new Set(wholeTier)].sort();
  const normalized = legs.map((files) => [...new Set(files)].sort());
  if (whole.length === 0 || legs.length < 2) throw new Error("E2E partition requires a non-empty tier and at least two legs");
  if (normalized.some((files) => files.length === 0 || files.length >= whole.length)) {
    throw new Error("Each E2E shard must be a non-empty proper subset of the whole tier");
  }
  const occurrences = new Map<string, number>();
  for (const file of normalized.flat()) occurrences.set(file, (occurrences.get(file) ?? 0) + 1);
  if ([...occurrences.values()].some((count) => count !== 1)) throw new Error("Every E2E file must land on exactly one shard");
  if ([...occurrences.keys()].sort().join("\n") !== whole.join("\n")) throw new Error("E2E shards do not partition the whole tier");
  return { wholeTier: whole, legs: normalized.map((files, index) => ({ shard: index + 1, files })) };
}
