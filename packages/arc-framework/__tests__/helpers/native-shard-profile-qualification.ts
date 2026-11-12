/** Membership-only composition of unchanged strict checks; homogeneous callers use the original helper directly. */
import { qualifyNativeShardMembership, type NativeMembershipRun } from "./native-shard-qualification.js";
import type { NativeMember } from "./native-shard-evidence.js";

export interface NativeMembershipMatrix {
  baseline: NativeMembershipRun;
  shards: readonly NativeMembershipRun[];
}

/**
 * Require real same-capture homogeneous witnesses for a mixed observed matrix.
 * Return membership only: caller retains observation provenance and all lifecycle/verdict authority.
 */
export function qualifyCorroboratedNativeShardMembership(actual: NativeMembershipMatrix,
  corroborations: readonly NativeMembershipMatrix[], count: number): NativeMember[] {
  if (!Number.isInteger(count) || count < 1 || actual.shards.length !== count) {
    throw new Error("Incomplete actual native shard matrix.");
  }
  if (corroborations.length === 0) throw new Error("Missing homogeneous native corroboration.");
  const selected = corroborations.map(matrix => qualifyNativeShardMembership(matrix.baseline, matrix.shards, count));
  const basis = basisIdentity(actual.baseline.basis);
  const members = memberIdentity(selected[0]!);
  for (let index = 0; index < corroborations.length; index++) {
    if (basisIdentity(corroborations[index]!.baseline.basis) !== basis) {
      throw new Error("Native corroboration captured input basis differs.");
    }
    if (memberIdentity(selected[index]!) !== members) throw new Error("Native corroboration selected members differ.");
  }
  for (const run of actual.shards) {
    if (basisIdentity(run.basis) !== basis) throw new Error("Actual native captured input basis differs.");
  }

  const actualSelected = corroborate(actual.baseline);
  const indexes = new Set<number>();
  for (const run of actual.shards) {
    const coordinate = run.observations.length === 1 ? run.observations[0]?.shard : undefined;
    if (coordinate === undefined || coordinate.count !== count || !Number.isInteger(coordinate.index)
      || coordinate.index < 1 || coordinate.index > count || indexes.has(coordinate.index)) {
      throw new Error("Missing or duplicated actual native shard coordinate.");
    }
    indexes.add(coordinate.index);
    corroborate(run, coordinate.index);
  }
  if (memberIdentity(actual.shards.flatMap(run => run.observations[0]!.assigned)) !== memberIdentity(actualSelected)) {
    throw new Error("Actual mixed native membership differs: complete shard union.");
  }
  return actualSelected;

  function corroborate(run: NativeMembershipRun, index?: number): NativeMember[] {
    const runtime = runtimeIdentity(run);
    let cause: unknown;
    for (const matrix of corroborations) {
      if (runtime === undefined || runtimeIdentity(matrix.baseline) !== runtime) continue;
      const baseline = index === undefined ? run : matrix.baseline;
      const shards = index === undefined ? matrix.shards : matrix.shards.map(witness =>
        witness.observations[0]!.shard!.index === index ? run : witness);
      try {
        // Replace the original observed row, never its runtime or native fields.
        return qualifyNativeShardMembership(baseline, shards, count);
      } catch (error) { cause = error; }
    }
    throw new Error(`No matching qualified native witness for ${index === undefined ? "baseline" : `shard ${index}`}.`, { cause });
  }
}

function basisIdentity(basis: NativeMembershipRun["basis"]): string {
  const duration = basis.duration;
  return JSON.stringify([basis.sourceDigest, basis.environmentIdentity, basis.selection, duration.kind, duration.state,
    ...(duration.state === "file" ? [duration.digest, duration.bytes] : [])]);
}

function runtimeIdentity(run: NativeMembershipRun): string | undefined {
  const runtime = run.observations.length === 1 ? run.observations[0]?.runtime : undefined;
  // Exact observed values only; this comparison key never changes an observation.
  return runtime === undefined ? undefined : JSON.stringify([runtime.node, runtime.vitest, runtime.platform, runtime.arch]);
}

function memberIdentity(members: readonly NativeMember[]): string {
  const keys = members.map(member => JSON.stringify([member.project, member.file])).sort();
  if (new Set(keys).size !== keys.length) throw new Error("Duplicated actual native membership.");
  return JSON.stringify(keys);
}
