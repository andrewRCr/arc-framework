import { describe, expect, it } from "vitest";
import { discoverShards } from "../../../../src/scripts/typecheck/shards.js";

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
