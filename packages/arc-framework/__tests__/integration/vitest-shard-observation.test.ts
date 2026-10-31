/** Native observations distinguish discovery, assigned files and worker-produced completion. */
import { rm } from "node:fs/promises";
import { expect, it } from "vitest";
import { makeNativeShardFixture } from "../helpers/native-shard-fixture.js";
import { readNativeShardObservations, type NativeMember } from "../helpers/native-shard-observer.js";
import { runVitestControllerFixture } from "../helpers/vitest-controller-fixture.js";

const identities = (members: readonly NativeMember[]) => members.map(member => JSON.stringify(member)).sort();

it("observes native discovery and actual assignments without executing pre-parsed unassigned modules", async () => {
  const fixture = await makeNativeShardFixture();
  const expected = ["unit", "unit-mocks"].flatMap(project => ["a", "b", "c"].map(name => ({
    project, file: `tests/${name}.test.mjs`,
  })));
  const assigned: NativeMember[][] = [];
  try {
    for (const shard of [undefined, "1/2", "2/2"]) {
      const result = await runVitestControllerFixture(fixture.packageRoot,
        ["unit", ...(shard === undefined ? [] : ["--shard", shard])]);
      expect(result.code, result.stdout + result.stderr).toBe(0);
      const records = readNativeShardObservations(result.stdout);
      expect(records, result.stdout).toHaveLength(1);
      const record = records[0]!;
      expect(record.cycle).toBe(1);
      expect(identities(record.selected)).toEqual(identities(expected));
      expect(record.sortCalls).toBe(1);
      expect(record.shardCalls).toBe(shard === undefined ? 0 : 1);
      expect(identities(record.ordered)).toEqual(identities(record.assigned));
      expect(identities(record.queued)).toEqual(identities(record.assigned));
      expect(identities(record.ended)).toEqual(identities(record.assigned));
      if (shard === undefined) {
        expect(record.shard).toBeUndefined();
        expect(identities(record.assigned)).toEqual(identities(expected));
      } else {
        expect(record.shard).toEqual({ index: Number(shard[0]), count: 2 });
        expect(record.assigned.length).toBeGreaterThan(0);
        expect(record.assigned.length).toBeLessThan(expected.length);
        assigned.push(record.assigned);
      }
    }
    expect(identities(assigned.flat())).toEqual(identities(expected));
  } finally { await rm(fixture.root, { recursive: true, force: true }); }
}, 90_000);
