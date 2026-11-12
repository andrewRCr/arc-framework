/** Synthetic producer-shaped membership fixtures; these are not deployment/profile evidence. */
import assert from "node:assert/strict";
import { it } from "vitest";
import { qualifyGateNativeCoverage } from "../helpers/gate-qualification/native-coverage.js";
import type { NativeMembershipMatrix } from "../helpers/native-shard-profile-qualification.js";
import type { NativeMembershipRun } from "../helpers/native-shard-qualification.js";
import type { NativeMember, NativeRuntimeProfile } from "../helpers/native-shard-evidence.js";

const members: NativeMember[] = ["unit", "unit-mocks"].flatMap(project =>
  ["__tests__/a.test.ts", "__tests__/b.test.ts"].map(file => ({ project, file })));
const arm: NativeRuntimeProfile = { node: "v26.3.0", vitest: "4.1.11", platform: "linux", arch: "arm64" };
const x64: NativeRuntimeProfile = { ...arm, arch: "x64" };
const basis = { sourceDigest: "sha256:fixture-source", environmentIdentity: "sha256:fixture-inputs",
  selection: ["native-fixture"], duration: { kind: "file", state: "unset" } } as const;

function row(runtime: NativeRuntimeProfile, assigned: NativeMember[], shard?: { index: number; count: number }): NativeMembershipRun {
  return { exitCode: 0, basis, observations: [{ cycle: 1, runtime, duration: basis.duration,
    selected: members, assigned, ordered: assigned, queued: assigned, ended: assigned,
    shardCalls: shard === undefined ? 0 : 1, sortCalls: 1, ...(shard === undefined ? {} : { shard }) }] };
}

function matrix(runtime: NativeRuntimeProfile, count: number): NativeMembershipMatrix {
  return { baseline: row(runtime, members), shards: Array.from({ length: count }, (_, index) =>
    row(runtime, members.filter((_, position) => position % count === index), { index: index + 1, count })) };
}

function ordinaryInput() {
  const left = matrix(arm, 2), right = matrix(x64, 2);
  return structuredClone({ baseline: [left.baseline], distributed: [right.baseline], corroborations: [left, right] });
}

function freeze(value: unknown): void {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
}

it.each([2, 4])("qualifies unchanged mixed routed native rows through complete homogeneous witnesses (%i shards)", count => {
  const left = matrix(arm, count), right = matrix(x64, count);
  const input = structuredClone({ baseline: [left.baseline], distributed: left.shards.map((value, index) =>
    index % 2 === 0 ? value : right.shards[index]!), corroborations: [left, right] });
  const before = JSON.stringify(input);
  freeze(input);
  assert.deepEqual(qualifyGateNativeCoverage(input.baseline, input.distributed, { count, routed: true }, input.corroborations), members);
  assert.equal(JSON.stringify(input), before);
});

it("proves each cross-profile ordinary row against a real baseline and declared two-shard witness without changing the row", () => {
  const input = ordinaryInput();
  const before = JSON.stringify(input);
  freeze(input);
  assert.deepEqual(qualifyGateNativeCoverage(input.baseline, input.distributed, { count: 2 }, input.corroborations), members);
  assert.equal(input.baseline[0]!.observations[0]!.shard, undefined);
  assert.equal(input.distributed[0]!.observations[0]!.shard, undefined);
  assert.equal(JSON.stringify(input), before);
});

const invalidOrdinary: { name: string; change(input: ReturnType<typeof ordinaryInput>): void }[] = [
  { name: "a missing exact-profile witness", change: input => { input.corroborations = input.corroborations.slice(0, 1); } },
  { name: "an incomplete homogeneous matrix", change: input => { input.corroborations[1]!.shards = input.corroborations[1]!.shards.slice(0, 1); } },
  { name: "a witness with a different captured basis", change: input => {
    const witness = input.corroborations[1]!;
    for (const run of [witness.baseline, ...witness.shards]) run.basis = { ...run.basis, sourceDigest: "sha256:different-fixture-source" };
  } },
  { name: "a failed actual ordinary row", change: input => { input.distributed[0]!.exitCode = 1; } },
];

it.each(invalidOrdinary)("refuses cross-profile ordinary qualification with $name", ({ change }) => {
  const input = ordinaryInput();
  change(input);
  assert.throws(() => qualifyGateNativeCoverage(input.baseline, input.distributed, { count: 2 }, input.corroborations));
});
