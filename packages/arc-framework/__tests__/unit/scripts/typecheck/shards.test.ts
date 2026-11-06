import { describe, expect, it } from "vitest";
import { compareShardPartition, discoverShards, type ParsedProgram, type ParsedShard } from "../../../../src/scripts/typecheck/shards.js";

describe("shard discovery", () => {
  it("returns config files sorted by shard name", () => {
    expect(discoverShards("/package", () => ["tsconfig.shard-unit-b.json", "tsconfig.shard-integration-store.json", "tsconfig.shard-unit-a.json"]))
      .toEqual([
        { name: "integration-store", config: "tsconfig.shard-integration-store.json" },
        { name: "unit-a", config: "tsconfig.shard-unit-a.json" },
        { name: "unit-b", config: "tsconfig.shard-unit-b.json" },
      ]);
  });
  it("leaves the base and other TypeScript configs outside the shard set", () => {
    expect(discoverShards("/package", () => ["tsconfig.shards.json", "tsconfig.json", "tsconfig.test.json", "tsconfig.shard-.json"]))
      .toEqual([]);
  });
});

const reference: ParsedProgram = { fileNames: ["/tests/a.ts", "/tests/b.ts"], options: { strict: true } };
const a: ParsedShard = { name: "a", fileNames: ["/tests/a.ts"], options: { strict: true } };
const b: ParsedShard = { name: "b", fileNames: ["/tests/b.ts"], options: { strict: true } };

describe("shard partition", () => {
  it("requires at least one shard", () => {
    expect(compareShardPartition({ fileNames: [], options: {} }, [])).toEqual(["No shard configs found."]);
  });
  it("names a root missing from every shard", () => {
    expect(compareShardPartition(reference, [a])).toEqual(["Missing root /tests/b.ts (no shard)."]);
  });
  it("names a doubled root and both shards", () => {
    expect(compareShardPartition(reference, [a, { ...b, fileNames: [...b.fileNames, "/tests/a.ts"] }]))
      .toEqual(["Root /tests/a.ts belongs to multiple shards: a, b."]);
  });
  it("names an extra root and its shard", () => {
    expect(compareShardPartition(reference, [a, { ...b, fileNames: [...b.fileNames, "/tests/extra.ts"] }]))
      .toEqual(["Unexpected root /tests/extra.ts in shard b."]);
  });
  it("names a changed option and its shard", () => {
    expect(compareShardPartition(reference, [a, { ...b, options: { strict: false } }]))
      .toEqual(["Option strict differs in shard b."]);
  });
  it("ignores only declaration, declarationMap, tsBuildInfoFile and configFilePath", () => {
    const options = { ...a.options, declaration: false, declarationMap: false, tsBuildInfoFile: "/cache/a", configFilePath: "/a.json" };
    expect(compareShardPartition({ ...reference, options: { strict: true, declaration: true, declarationMap: true } }, [{ ...a, options }, b]))
      .toEqual([]);
  });
  it("accepts an exact partition", () => {
    expect(compareShardPartition(reference, [a, b])).toEqual([]);
  });
});


describe("shard-name ordering", () => {
  it("puts a shorter shard name before one extending it", () => {
    expect(discoverShards("/package", () => ["tsconfig.shard-integration-store.json", "tsconfig.shard-integration.json"])
      .map(shard => shard.name)).toEqual(["integration", "integration-store"]);
  });
});
