/** Native reach preflight is distinct from the one execution partition across project groups. */
import { execa } from "execa";
import { rm } from "node:fs/promises";
import { expect, it } from "vitest";
import { makeNativeReachFixture } from "../helpers/native-reach-fixture.js";
import { readNativeShardObservations } from "../helpers/native-shard-evidence.js";
import { qualifyNativeShardMembership, type NativeMembershipRun } from "../helpers/native-shard-qualification.js";

it("observes reach preflight separately from actual native execution over every project group", async () => {
  const fixture = await makeNativeReachFixture();
  const runs: NativeMembershipRun[] = [];
  const basis = { sourceDigest: "fixture source", environmentIdentity: "fixture inputs", selection: ["all fixture suites"],
    duration: { kind: "file", state: "unset" } } as const;
  try {
    for (const shard of [undefined, "1/2", "2/2"]) {
      const result = await execa(process.execPath, ["--import", "tsx", fixture.entry,
        ...(shard === undefined ? [] : [`--shard=${shard}`])], { cwd: fixture.packageRoot,
        // The outer run owns pool admission; these tiny controllers exercise real native sequencing.
        env: { CI: "1", FORCE_COLOR: undefined, ARC_E2E_SKIP_BUILD: undefined, ARC_TEST_DURATION_FILE: undefined },
        reject: false, timeout: 30_000 });
      expect(result.exitCode, result.stdout + result.stderr).toBe(0);
      const observations = readNativeShardObservations(result.stdout);
      expect(observations).toHaveLength(1);
      const record = observations[0]!;
      expect(record.shardCalls).toBe(shard === undefined ? 0 : 1);
      expect(record.sortCalls).toBe(1);
      if (shard !== undefined) expect(record).toMatchObject({ preflight: {
        selected: record.selected, assigned: record.assigned, shardCalls: 1,
      } });
      runs.push({ exitCode: result.exitCode ?? -1, basis, observations });
    }
    const members = qualifyNativeShardMembership(runs[0]!, runs.slice(1), 2);
    expect(members).toHaveLength(9);
    expect(new Set(members.map(member => member.project)))
      .toEqual(new Set(["integration", "integration-timing", "integration-bursts"]));
  } finally { await rm(fixture.root, { recursive: true, force: true }); }
}, 120_000);
