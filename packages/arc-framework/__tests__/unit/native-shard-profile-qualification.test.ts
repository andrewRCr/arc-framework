/** Synthetic validation fixtures follow the real native observation producer; these are not deployment evidence. */
import assert from "node:assert/strict";
import { it } from "vitest";
import { qualifyCorroboratedNativeShardMembership, type NativeMembershipMatrix } from "../helpers/native-shard-profile-qualification.js";
import { qualifyNativeShardMembership, type NativeMembershipRun } from "../helpers/native-shard-qualification.js";
import type { NativeMember, NativeRuntimeProfile } from "../helpers/native-shard-evidence.js";

const members: NativeMember[] = ["unit", "unit-mocks"].flatMap(project =>
  ["tests/a.test.mjs", "tests/b.test.mjs"].map(file => ({ project, file })));
const arm: NativeRuntimeProfile = { node: process.version, vitest: "4.1.11", platform: "linux", arch: "arm64" };
const x64: NativeRuntimeProfile = { ...arm, arch: "x64" };
const basis = { sourceDigest: "sha256:fixture-source", environmentIdentity: "sha256:fixture-inputs",
  selection: ["unit"], duration: { kind: "file", state: "unset" } } as const;

function row(runtime: NativeRuntimeProfile, selected: NativeMember[], assigned: NativeMember[], index?: number): NativeMembershipRun {
  const empty = index !== undefined && assigned.length === 0;
  return { exitCode: 0, basis, observations: [{ cycle: empty ? 0 : 1, runtime, duration: basis.duration,
    selected, assigned, ordered: assigned, queued: assigned, ended: assigned,
    shardCalls: index === undefined || empty ? 0 : 1, sortCalls: empty ? 0 : 1,
    ...(index === undefined ? {} : { shard: { index, count: 4 } }),
    ...(empty ? { closed: true, preflight: { selected, assigned, shardCalls: 1 } } : {}) }] };
}

function matrix(runtime: NativeRuntimeProfile, selected = members,
  assignments = selected.map(member => [member])): NativeMembershipMatrix {
  return { baseline: row(runtime, selected, selected),
    shards: Array.from({ length: 4 }, (_, index) => row(runtime, selected, assignments[index] ?? [], index + 1)) };
}

function examples() {
  const left = matrix(arm);
  const right = matrix(x64);
  const actual = { baseline: structuredClone(left.baseline),
    shards: [left.shards[0]!, right.shards[1]!, left.shards[2]!, right.shards[3]!].map(value => structuredClone(value)) };
  return { actual, corroborations: [left, right] };
}

it("accepts unchanged mixed rows only with complete exact-profile corroboration and does not mutate them", () => {
  const input = examples();
  const before = JSON.stringify(input);
  const freeze = (value: unknown): void => {
    if (value && typeof value === "object" && !Object.isFrozen(value)) {
      Object.values(value).forEach(freeze);
      Object.freeze(value);
    }
  };
  freeze(input);
  let qualified: NativeMember[] | undefined;
  assert.doesNotThrow(() => { qualified = qualifyCorroboratedNativeShardMembership(input.actual, input.corroborations, 4); });
  assert.deepEqual(qualified, members);
  assert.equal(JSON.stringify(input), before);
  assert.throws(() => qualifyNativeShardMembership(input.actual.baseline, input.actual.shards, 4), /runtime/u);
});

it("leaves homogeneous qualification available through the original unchanged helper", () => {
  const native = matrix(arm);
  assert.deepEqual(qualifyNativeShardMembership(native.baseline, native.shards, 4), members);
});

it("requires a real matrix argument for every observed profile instead of substituting a runtime identity", () => {
  const input = examples();
  assert.throws(() => qualifyCorroboratedNativeShardMembership(input.actual, [], 4));
  assert.throws(() => qualifyCorroboratedNativeShardMembership(input.actual, [input.corroborations[0]!], 4));
});

it("strictly validates even an unused corroboration instead of accepting a partial witness", () => {
  const input = examples();
  const incomplete = structuredClone(matrix({ ...arm, node: "v99.0.0" }));
  incomplete.shards = incomplete.shards.slice(0, 3);
  assert.throws(() => qualifyCorroboratedNativeShardMembership(input.actual,
    [...input.corroborations, incomplete], 4));
});

it("requires one captured source, environment, selection and duration basis across individually valid matrices", () => {
  for (const change of [
    { sourceDigest: "sha256:other" }, { environmentIdentity: "sha256:other" }, { selection: ["integration"] },
    { duration: { kind: "file", state: "file", digest: "sha256:" + "a".repeat(64), bytes: 10 } },
  ] as const) {
    const input = examples();
    const changed = structuredClone(input.corroborations[1]!);
    for (const value of [changed.baseline, ...changed.shards]) {
      value.basis = { ...basis, ...change };
      value.observations[0]!.duration = value.basis.duration;
    }
    assert.deepEqual(qualifyNativeShardMembership(changed.baseline, changed.shards, 4), members);
    assert.throws(() => qualifyCorroboratedNativeShardMembership(input.actual,
      [input.corroborations[0]!, changed], 4));
  }
});

it("refuses different native selected members even when each matrix separately qualifies", () => {
  const input = examples();
  const different = matrix(x64, members.map(member => ({ ...member, file: "other/" + member.file })));
  qualifyNativeShardMembership(different.baseline, different.shards, 4);
  assert.throws(() => qualifyCorroboratedNativeShardMembership(input.actual,
    [input.corroborations[0]!, different], 4));
});

it("runs unchanged strict checks on actual sequencing, completion and duration via row substitution", () => {
  for (const change of ["completion", "sequencing", "duration", "exit", "extra-cycle"] as const) {
    const input = structuredClone(examples());
    const target = input.actual.shards[1]!;
    if (change === "completion") target.observations[0]!.ended = [];
    if (change === "sequencing") target.observations[0]!.shardCalls = 2;
    if (change === "duration") target.observations[0]!.duration = { kind: "file", state: "empty" };
    if (change === "exit") target.exitCode = 1;
    if (change === "extra-cycle") target.observations = [...target.observations, ...target.observations];
    assert.throws(() => qualifyCorroboratedNativeShardMembership(input.actual, input.corroborations, 4));
  }
});

it("rejects actual duplicated coordinates even when every row has a valid witness and the member union is exact", () => {
  const left = matrix(arm);
  const right = matrix(x64, members, [[members[1]!], [members[0]!], [members[3]!], [members[2]!]]);
  const actual = { baseline: structuredClone(left.baseline),
    shards: [left.shards[0]!, right.shards[0]!, left.shards[2]!, right.shards[2]!].map(value => structuredClone(value)) };
  assert.throws(() => qualifyCorroboratedNativeShardMembership(actual, [left, right], 4));
});

it("rejects a duplicate/missing mixed union despite complete coordinate and independently valid runtime witnesses", () => {
  const left = matrix(arm);
  const right = matrix(x64, members, [[members[1]!], [members[0]!], [members[3]!], [members[2]!]]);
  const actual = { baseline: structuredClone(left.baseline),
    shards: [left.shards[0]!, right.shards[1]!, left.shards[2]!, right.shards[3]!].map(value => structuredClone(value)) };
  assert.throws(() => qualifyCorroboratedNativeShardMembership(actual, [left, right], 4));
});

it("retains the existing strict closed-empty-share contract", () => {
  const selected = members.slice(0, 2);
  const left = matrix(arm, selected);
  const right = matrix(x64, selected);
  const actual = { baseline: structuredClone(left.baseline),
    shards: [left.shards[0]!, right.shards[1]!, left.shards[2]!, right.shards[3]!].map(value => structuredClone(value)) };
  let qualified: NativeMember[] | undefined;
  assert.doesNotThrow(() => { qualified = qualifyCorroboratedNativeShardMembership(actual, [left, right], 4); });
  assert.deepEqual(qualified, selected);
});
