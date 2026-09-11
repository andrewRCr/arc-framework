/** Effective E2E shard membership, derived from Vitest rather than reimplementing its hash. */

export interface E2EShardMembership {
  readonly wholeTier: readonly string[];
  readonly excludedAnchors: readonly string[];
  readonly legs: readonly (readonly string[])[];
}

export function parseWorkflowE2EExclusions(workflow: string): string[] {
  const exclusions = [...workflow.matchAll(/--exclude='([^']+)'/gu)].map((match) => match[1]);
  if (exclusions.length === 0 || exclusions.some((value) => value === undefined)) {
    throw new Error("CI workflow declares no E2E remainder exclusions");
  }
  return exclusions as string[];
}

export function validateE2EShardMembership(
  wholeTier: readonly string[],
  excludedAnchors: readonly string[],
  legs: readonly (readonly string[])[],
): E2EShardMembership {
  const whole = uniqueSorted(wholeTier);
  if (whole.length === 0) throw new Error("Filtered E2E tier is empty");
  if (legs.length < 2) throw new Error("E2E membership requires at least two shard legs");
  const normalizedLegs = legs.map(uniqueSorted);
  if (normalizedLegs.some((leg) => sameMembers(leg, whole))) {
    throw new Error("A shard leg returned the whole filtered tier; collecting shard membership is required");
  }
  if (normalizedLegs.some((leg) => leg.length === 0 || leg.length >= whole.length)) {
    throw new Error("Every E2E partition leg must be a non-empty proper subset of the filtered tier");
  }
  if (new Set(normalizedLegs.map((leg) => leg.join("\n"))).size < 2) {
    throw new Error("E2E shard legs did not differ");
  }
  const excludedNames = excludedAnchors.map((glob) => glob.replace(/^\*\*\//u, ""));
  if (normalizedLegs.flat().some((file) => excludedNames.some((name) => file.endsWith(name)))) {
    throw new Error("An excluded anchor appeared in E2E remainder membership");
  }
  const occurrences = new Map<string, number>();
  for (const file of normalizedLegs.flat()) {
    occurrences.set(file, (occurrences.get(file) ?? 0) + 1);
  }
  if ([...occurrences.values()].some((count) => count !== 1)) {
    throw new Error("Every filtered E2E file must land on exactly one shard leg");
  }
  if (!sameMembers([...occurrences.keys()].sort(), whole)) {
    throw new Error("E2E shard legs do not partition the filtered tier");
  }
  return { wholeTier: whole, excludedAnchors: [...excludedAnchors], legs: normalizedLegs };
}

function uniqueSorted(values: readonly string[]): string[] {
  return [...new Set(values)].sort();
}

function sameMembers(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}
