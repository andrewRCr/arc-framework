/** Pure native membership qualification; lifecycle and measured-gate authority remain with callers. */
import { qualifyNativeShardMembership, type NativeMembershipRun } from "../native-shard-qualification.js";
import { qualifyCorroboratedNativeShardMembership, type NativeMembershipMatrix } from "../native-shard-profile-qualification.js";
import { NativeShardObservationSchema, type NativeMember } from "../native-shard-evidence.js";
import { identity } from "./model.js";

function members(values: readonly NativeMember[]): string {
  const keys = values.map(value => JSON.stringify([value.project, value.file])).sort();
  if (new Set(keys).size !== keys.length) throw new Error("Duplicated native member.");
  return JSON.stringify(keys);
}

function ordinary(run: NativeMembershipRun): ReturnType<typeof NativeShardObservationSchema.parse> {
  if (run.exitCode !== 0 || run.observations.length !== 1) throw new Error("Missing successful ordinary native observation.");
  const record = NativeShardObservationSchema.parse(run.observations[0]);
  if (record.cycle !== 1 || record.closed !== undefined || record.shard !== undefined || record.shardCalls !== 0
    || record.sortCalls !== 1 || record.assigned.length === 0 || record.preflight !== undefined
    || identity(record.duration) !== identity(run.basis.duration)) throw new Error("Invalid ordinary native observation.");
  for (const actual of [record.selected, record.ordered, record.queued, record.ended]) {
    if (members(actual) !== members(record.assigned)) throw new Error("Ordinary native membership was incomplete.");
  }
  return record;
}

/** Retain ordinary rows unchanged; corroboration establishes membership only, never reusable runtime authority. */
export function qualifyGateNativeCoverage(baseline: readonly NativeMembershipRun[], distributed: readonly NativeMembershipRun[],
  shards: { count: number; routed?: boolean } | undefined, corroborations: readonly NativeMembershipMatrix[] = []): NativeMember[] {
  if (baseline.length !== 1) throw new Error("Native baseline or complete matrix is missing.");
  if (shards?.routed) {
    try { return qualifyNativeShardMembership(baseline[0]!, distributed, shards.count); }
    catch (cause) {
      if (corroborations.length === 0) throw cause;
      return qualifyCorroboratedNativeShardMembership({ baseline: baseline[0]!, shards: distributed }, corroborations, shards.count);
    }
  }
  if (distributed.length !== 1) throw new Error("Unexpected ordinary native matrix.");
  const first = ordinary(baseline[0]!), second = ordinary(distributed[0]!);
  if (identity(baseline[0]!.basis) !== identity(distributed[0]!.basis)
    || identity(first.duration) !== identity(second.duration)
    || members(first.assigned) !== members(second.assigned)) throw new Error("Ordinary native basis or membership differs.");
  if (identity(first.runtime) !== identity(second.runtime)) {
    const count = shards?.count;
    if (count === undefined || !Number.isInteger(count) || count < 1 || corroborations.length === 0) {
      throw new Error("Cross-profile ordinary native rows require a declared shard count and complete homogeneous witnesses.");
    }
    for (const witness of corroborations) {
      const selected = qualifyNativeShardMembership(witness.baseline, witness.shards, count);
      if (identity(witness.baseline.basis) !== identity(baseline[0]!.basis)
        || members(selected) !== members(first.assigned)) throw new Error("Ordinary native witness basis or membership differs.");
    }
    for (const run of [baseline[0]!, distributed[0]!]) {
      const witness = corroborations.find(value => identity(value.baseline.observations[0]!.runtime)
        === identity(run.observations[0]!.runtime));
      if (witness === undefined) throw new Error("Missing exact-profile homogeneous witness for an ordinary native row.");
      qualifyNativeShardMembership(run, witness.shards, count);
    }
  }
  return [...first.assigned];
}
