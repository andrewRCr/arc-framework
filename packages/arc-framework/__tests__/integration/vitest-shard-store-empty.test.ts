/** Reach empty shares qualify only with native preflight, awaited closing and zero execution. */
import { createHash } from "node:crypto";
import { execa } from "execa";
import { readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { expect, it } from "vitest";
import { makeNativeReachFixture } from "../helpers/native-reach-fixture.js";
import { readNativeShardObservations } from "../helpers/native-shard-evidence.js";
import { qualifyNativeShardMembership, type NativeMembershipRun } from "../helpers/native-shard-qualification.js";

it("qualifies one closed empty Reach share without accepting ordinary empty runs or native close failures", async () => {
  const fixture = await makeNativeReachFixture(["a"]);
  const projects = ["integration", "integration-timing", "integration-bursts"];
  // Positive recorded weights put the three identities in different shares, leaving exactly one empty.
  const content = JSON.stringify({ results: projects.map(project => [`${project}:tests/a.test.mjs`, { duration: 1 }]) });
  const durationFile = join(fixture.packageRoot, "durations.json");
  const basis = { sourceDigest: "fixture source", environmentIdentity: "fixture inputs", selection: ["tests/a"],
    duration: { kind: "file", state: "file", digest: `sha256:${createHash("sha256").update(content).digest("hex")}`,
      bytes: Buffer.byteLength(content) } } as const;
  const runs: NativeMembershipRun[] = [];
  const native = async (shard?: string) => await execa(process.execPath, ["--import", "tsx", fixture.entry,
    ...(shard === undefined ? [] : [`--shard=${shard}`])], { cwd: fixture.packageRoot,
    // These small native controllers run beneath the outer check's pool admission.
    env: { CI: "1", FORCE_COLOR: undefined, ARC_E2E_SKIP_BUILD: undefined, ARC_TEST_DURATION_FILE: durationFile },
    reject: false, timeout: 30_000 });
  try {
    await writeFile(durationFile, content);
    for (const shard of [undefined, "1/4", "2/4", "3/4", "4/4"]) {
      const result = await native(shard);
      expect(result.exitCode, result.stdout + result.stderr).toBe(0);
      const observations = readNativeShardObservations(result.stdout);
      expect(observations, result.stdout + result.stderr).toHaveLength(1);
      runs.push({ exitCode: result.exitCode ?? -1, basis, observations });
    }
    const [baseline, ...shards] = runs;
    const members = qualifyNativeShardMembership(baseline!, shards, 4);
    expect(members.map(member => `${member.project}:${member.file}`).sort())
      .toEqual(projects.map(project => `${project}:tests/a.test.mjs`).sort());
    const empty = shards.filter(run => run.observations[0]!.assigned.length === 0);
    expect(empty).toHaveLength(1);
    const emptyRun = empty[0]!;
    const emptyRecord = emptyRun.observations[0]!;
    expect(emptyRecord).toMatchObject({ cycle: 0, closed: true, assigned: [], ordered: [],
      queued: [], ended: [], shardCalls: 0, sortCalls: 0,
      preflight: { selected: emptyRecord.selected, assigned: [], shardCalls: 1 } });
    expect(emptyRecord.selected.map(member => `${member.project}:${member.file}`).sort())
      .toEqual(members.map(member => `${member.project}:${member.file}`).sort());
    for (const run of shards.filter(value => value !== emptyRun)) {
      expect(run.observations[0]).toMatchObject({ cycle: 1, shardCalls: 1, sortCalls: 1 });
      expect(run.observations[0]!.assigned).toHaveLength(1);
    }

    const unclosed = structuredClone(emptyRun);
    Reflect.deleteProperty(unclosed.observations[0]!, "closed");
    expect(() => qualifyNativeShardMembership(baseline!, shards.map(run => run === emptyRun ? unclosed : run), 4)).toThrow();
    const ordinaryEmpty = structuredClone(emptyRun);
    Object.assign(ordinaryEmpty.observations[0]!, { cycle: 1, shardCalls: 1, sortCalls: 1 });
    Reflect.deleteProperty(ordinaryEmpty.observations[0]!, "closed");
    expect(() => qualifyNativeShardMembership(baseline!, shards.map(run => run === emptyRun ? ordinaryEmpty : run), 4)).toThrow();

    const configuration = join(fixture.packageRoot, "vitest.config.mjs");
    await writeFile(configuration, (await readFile(configuration, "utf8")).replace("watch: false, maxWorkers: 1,",
      `watch: false, maxWorkers: 1, reporters: [{ onInit(controller) {
        controller.onClose(() => { throw new Error("empty native close refused"); });
      } }],`));
    const coordinate = emptyRecord.shard!;
    const failed = await native(`${coordinate.index}/${coordinate.count}`);
    expect(failed.exitCode, failed.stdout + failed.stderr).toBe(1);
    expect(failed.stdout + failed.stderr).toContain("empty native close refused");
    const failedRun = { exitCode: failed.exitCode ?? -1, basis, observations: readNativeShardObservations(failed.stdout) };
    expect(failedRun.observations).toEqual([]);
    expect(() => qualifyNativeShardMembership(baseline!, shards.map(run => run === emptyRun ? failedRun : run), 4))
      .toThrow("Native command failed or has incomplete run observations.");
  } finally { await rm(fixture.root, { recursive: true, force: true }); }
}, 120_000);
