/** Qualification refuses incomplete or duplicated native membership despite successful command exits. */
import { expect, it } from "vitest";
import { qualifyNativeShardMembership, type NativeMembershipRun } from "../helpers/native-shard-qualification.js";
import type { NativeMember } from "../helpers/native-shard-evidence.js";

const members: NativeMember[] = ["unit", "unit-mocks"].map(project => ({ project, file: "tests/a.test.ts" }));
const runtime = { node: process.version, vitest: "4.1.11", platform: process.platform, arch: process.arch };
const basis = { sourceDigest: "sha256:source", environmentIdentity: "sha256:environment", selection: ["unit"],
  duration: { kind: "file", state: "unset" } } as const;
function run(assigned: NativeMember[], index?: number): NativeMembershipRun {
  return { exitCode: 0, basis, observations: [{ cycle: 1, runtime, duration: basis.duration, selected: members, assigned,
    ordered: assigned, queued: assigned, ended: assigned, sortCalls: 1, shardCalls: index === undefined ? 0 : 1,
    ...(index === undefined ? {} : { shard: { index, count: 2 } }) }] };
}

it("accepts native exact union while retaining equal filenames in distinct projects", () => {
  expect(qualifyNativeShardMembership(run(members), [run([members[0]!], 1), run([members[1]!], 2)], 2)).toEqual(members);
});

it.each([
  ["missing member", [run([members[0]!], 1), run([], 2)]],
  ["duplicated member", [run(members, 1), run([members[1]!], 2)]],
  ["missing shard", [run(members, 1)]],
  ["duplicated shard", [run([members[0]!], 1), run([members[1]!], 1)]],
] as const)("refuses %s even when every native command exits zero", (_name, shards) => {
  expect(() => qualifyNativeShardMembership(run(members), shards, 2)).toThrow();
});

it.each([
  ["different runtime", (value: NativeMembershipRun) => { value.observations[0]!.runtime = { ...runtime, vitest: "4.0.0" }; }],
  ["unknown runtime", (value: NativeMembershipRun) => { value.observations[0]!.runtime = { ...runtime, node: "unknown" }; }],
  ["different source", (value: NativeMembershipRun) => { value.basis = { ...basis, sourceDigest: "sha256:other" }; }],
  ["different explicit inputs", (value: NativeMembershipRun) => { value.basis = { ...basis, environmentIdentity: "sha256:other" }; }],
  ["different selection", (value: NativeMembershipRun) => { value.basis = { ...basis, selection: ["integration"] }; }],
  ["different duration state", (value: NativeMembershipRun) => { value.observations[0]!.duration = { kind: "file", state: "empty" }; }],
  ["missing observation", (value: NativeMembershipRun) => { value.observations = []; }],
  ["unexpected extra cycle", (value: NativeMembershipRun) => { value.observations = [...value.observations, ...value.observations]; }],
  ["wrong native discovery", (value: NativeMembershipRun) => { value.observations[0]!.selected = [members[0]!]; }],
  ["unexecuted assignment", (value: NativeMembershipRun) => { value.observations[0]!.ended = []; }],
  ["duplicate sequencing", (value: NativeMembershipRun) => { value.observations[0]!.shardCalls = 2; }],
  ["native failure after observation", (value: NativeMembershipRun) => { value.exitCode = 1; }],
] as const)("refuses %s despite apparently complete shard assignments", (_name, change) => {
  const invalid = structuredClone(run([members[1]!], 2));
  change(invalid);
  expect(() => qualifyNativeShardMembership(run(members), [run([members[0]!], 1), invalid], 2)).toThrow();
});
