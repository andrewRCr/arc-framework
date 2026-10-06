/** Effective E2E shard membership, derived from Vitest rather than reimplementing its hash. */

import { load } from "js-yaml";

export interface E2EShardMembership {
  readonly wholeTier: readonly string[];
  readonly legs: readonly {
    readonly shard: number;
    readonly files: readonly string[];
  }[];
}

/**
 * Read the number of E2E shard legs the CI workflow's matrix declares.
 * @param workflow - CI workflow YAML
 * @returns The E2E job's shard count
 */
export function parseWorkflowE2EShardCount(workflow: string): number {
  const parsed = load(workflow) as { jobs?: Record<string, { strategy?: { matrix?: { shard?: unknown } } }> };
  const shards = parsed.jobs?.["e2e"]?.strategy?.matrix?.shard;
  if (!Array.isArray(shards) || shards.length === 0) {
    throw new Error("CI workflow declares no E2E shard matrix");
  }
  if (shards.some((shard, index) => shard !== index + 1)) {
    throw new Error("CI workflow E2E shard matrix must number its legs contiguously from 1");
  }
  return shards.length;
}

/**
 * Check that native shard legs partition the E2E tier.
 * @param wholeTier - Every E2E file Vitest collects without sharding
 * @param legs - Files Vitest collects for each shard leg, in leg order
 * @returns Normalized membership for every leg
 */
export function validateE2EShardMembership(
  wholeTier: readonly string[],
  legs: readonly (readonly string[])[],
): E2EShardMembership {
  const whole = uniqueSorted(wholeTier);
  if (whole.length === 0) throw new Error("E2E tier is empty");
  if (legs.length < 2) throw new Error("E2E membership requires at least two shard legs");
  const normalizedLegs = legs.map(uniqueSorted);
  if (normalizedLegs.some((leg) => sameMembers(leg, whole))) {
    throw new Error("A shard leg returned the whole E2E tier; collecting shard membership is required");
  }
  if (normalizedLegs.some((leg) => leg.length === 0)) {
    throw new Error("Every E2E shard leg must be a non-empty proper subset of the tier");
  }
  const occurrences = new Map<string, number>();
  for (const file of normalizedLegs.flat()) {
    occurrences.set(file, (occurrences.get(file) ?? 0) + 1);
  }
  if ([...occurrences.values()].some((count) => count !== 1)) {
    throw new Error("Every E2E file must land on exactly one shard leg");
  }
  if (!sameMembers([...occurrences.keys()].sort(), whole)) {
    throw new Error("E2E shard legs do not partition the tier");
  }
  return {
    wholeTier: whole,
    legs: normalizedLegs.map((files, index) => ({ shard: index + 1, files })),
  };
}

function uniqueSorted(values: readonly string[]): string[] {
  return [...new Set(values)].sort();
}

function sameMembers(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}
