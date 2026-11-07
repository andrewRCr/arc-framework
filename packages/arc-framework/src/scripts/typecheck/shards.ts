/** Discover the package's shard configs without loading the TypeScript compiler. */
import { readdirSync } from "node:fs";
import { isDeepStrictEqual } from "node:util";

export interface ShardConfig { name: string; config: string }

/** Return the shard config file names in shard-name order. */
export function discoverShards(packageRoot: string, readDirectory: (path: string) => string[] = readdirSync): ShardConfig[] {
  return readDirectory(packageRoot)
    .filter(name => /^tsconfig\.shard-.+\.json$/.test(name))
    .map(config => ({ name: config.slice("tsconfig.shard-".length, -".json".length), config }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** Config-parser output consumed without loading a compiler in the check controller. */
export interface ParsedProgram {
  fileNames: readonly string[];
  options: Readonly<Record<string, unknown>>;
}
/** One named shard's parsed roots and compiler options. */
export interface ParsedShard extends ParsedProgram { name: string }

/** Compare the complete root partition and the compiler options that must remain identical. */
export function compareShardPartition(reference: ParsedProgram, shards: readonly ParsedShard[]): string[] {
  if (shards.length === 0) return ["No shard configs found."];
  return [
    ...compareRoots(reference.fileNames, shards),
    ...shards.flatMap(shard => compareOptions(reference.options, shard)),
  ];
}

const SHARD_OWNED_OPTIONS = new Set(["declaration", "declarationMap", "tsBuildInfoFile", "configFilePath"]);

function compareOptions(reference: ParsedProgram["options"], shard: ParsedShard): string[] {
  const keys = new Set([...Object.keys(reference), ...Object.keys(shard.options)]);
  return [...keys].sort()
    .filter(key => !SHARD_OWNED_OPTIONS.has(key) && !isDeepStrictEqual(reference[key], shard.options[key]))
    .map(key => `Option ${key} differs in shard ${shard.name}.`);
}

function compareRoots(reference: readonly string[], shards: readonly ParsedShard[]): string[] {
  const owners = new Map<string, string[]>();
  for (const shard of shards) {
    for (const file of shard.fileNames) {
      const names = owners.get(file) ?? [];
      names.push(shard.name);
      owners.set(file, names);
    }
  }
  const expected = new Set(reference);
  const issues = reference.filter(file => !owners.has(file)).map(file => `Missing root ${file} (no shard).`);
  for (const [file, names] of owners) {
    if (!expected.has(file)) issues.push(...names.map(name => `Unexpected root ${file} in shard ${name}.`));
    if (names.length > 1) issues.push(`Root ${file} belongs to multiple shards: ${names.join(", ")}.`);
  }
  return issues;
}
