/** Compare observed native membership within one captured selection and compatible runtime profile. */
import type { NativeMember, NativeShardObservation, NativeDurationInput } from "./native-shard-evidence.js";
import { NativeShardObservationSchema } from "./native-shard-evidence.js";

export interface NativeMembershipBasis {
  sourceDigest: string;
  environmentIdentity: string;
  selection: readonly string[];
  duration: NativeDurationInput;
}
export interface NativeMembershipRun {
  exitCode: number;
  basis: NativeMembershipBasis;
  observations: readonly NativeShardObservation[];
}

/** Require complete, exactly-once observed membership rather than interpreting successful exits alone. */
export function qualifyNativeShardMembership(baseline: NativeMembershipRun, shards: readonly NativeMembershipRun[], count: number): NativeMember[] {
  if (!Number.isInteger(count) || count < 1 || shards.length !== count) throw new Error("Incomplete native shard matrix.");
  const native = checkedRun(baseline, false);
  const selected = native.selected;
  equalMembers(native.assigned, selected, "unsharded selection");
  const indexes = new Set<number>();
  for (const run of shards) {
    const observed = checkedRun(run, true);
    if (basisIdentity(run.basis) !== basisIdentity(baseline.basis)) throw new Error("Native captured input basis differs.");
    if (JSON.stringify(observed.runtime) !== JSON.stringify(native.runtime)) throw new Error("Incompatible native runtime profiles.");
    equalMembers(observed.selected, selected, "native discovery");
    const shard = observed.shard;
    if (shard === undefined || shard.count !== count || shard.index < 1 || shard.index > count || indexes.has(shard.index)) {
      throw new Error("Missing or duplicated native shard coordinate.");
    }
    indexes.add(shard.index);
  }
  equalMembers(shards.flatMap(run => run.observations[0]!.assigned), selected, "complete shard union");
  return [...selected];
}

function equalMembers(actual: readonly NativeMember[], expected: readonly NativeMember[], label: string): void {
  const keys = (members: readonly NativeMember[]) => members.map(member => JSON.stringify([member.project, member.file])).sort();
  const actualKeys = keys(actual);
  const expectedKeys = keys(expected);
  if (new Set(actualKeys).size !== actualKeys.length || new Set(expectedKeys).size !== expectedKeys.length
    || JSON.stringify(actualKeys) !== JSON.stringify(expectedKeys)) throw new Error(`Native membership differs: ${label}.`);
}

function checkedRun(run: NativeMembershipRun, sharded: boolean): NativeShardObservation {
  if (run.exitCode !== 0 || run.observations.length !== 1) throw new Error("Native command failed or has incomplete run observations.");
  const record = NativeShardObservationSchema.parse(run.observations[0]);
  if (record.cycle !== 1 || record.sortCalls !== 1 || record.shardCalls !== (sharded ? 1 : 0)
    || (record.shard !== undefined) !== sharded) throw new Error("Unexpected native sequencing cycle.");
  if (durationIdentity(record.duration) !== durationIdentity(run.basis.duration)) throw new Error("Native duration input differs from capture.");
  if (record.preflight !== undefined) {
    if (!sharded || record.preflight.shardCalls !== 1) throw new Error("Unexpected native reach preflight cycle.");
    equalMembers(record.preflight.selected, record.selected, "reach preflight discovery");
    equalMembers(record.preflight.assigned, record.assigned, "reach preflight assignment");
  }
  for (const [label, members] of [["sorted assignment", record.ordered], ["worker queue", record.queued],
    ["worker completion", record.ended]] as const) equalMembers(members, record.assigned, label);
  return record;
}

function durationIdentity(input: NativeDurationInput): string {
  return JSON.stringify(input.state === "file" ? [input.state, input.digest, input.bytes] : [input.state]);
}

function basisIdentity(input: NativeMembershipBasis): string {
  return JSON.stringify([input.sourceDigest, input.environmentIdentity, input.selection, durationIdentity(input.duration)]);
}
