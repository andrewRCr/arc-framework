import { describe, expect, it } from "vitest";
import { resolve, relative } from "node:path";
import ts from "typescript";
import { compareShardPartition, discoverShards, type ParsedProgram } from "../../../../src/scripts/typecheck/shards.js";

const packageRoot = resolve(import.meta.dirname, "../../../..");
function parseConfig(file: string): ParsedProgram {
  const path = resolve(packageRoot, file);
  const read = ts.readConfigFile(path, ts.sys.readFile);
  expect(read.error, path).toBeUndefined();
  const parsed = ts.parseJsonConfigFileContent(read.config, ts.sys, packageRoot, undefined, path);
  expect(parsed.errors, path).toEqual([]);
  return { fileNames: parsed.fileNames, options: parsed.options };
}

describe("live test shard coverage", () => {
  it("partitions every reference root outside source and examples with the reference options", () => {
    const reference = parseConfig("tsconfig.test.json");
    reference.fileNames = reference.fileNames.filter(file => {
      const local = relative(packageRoot, file).replaceAll("\\", "/");
      return !local.startsWith("src/") && !local.startsWith("examples/");
    });
    const shards = discoverShards(packageRoot).map(shard => ({ name: shard.name, ...parseConfig(shard.config) }));
    expect(compareShardPartition(reference, shards)).toEqual([]);
  });
});
