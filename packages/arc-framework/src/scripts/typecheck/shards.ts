/** Discover the package's shard configs without loading the TypeScript compiler. */
import { readdirSync } from "node:fs";

export interface ShardConfig { name: string; config: string }

/** Return the shard config file names in shard-name order. */
export function discoverShards(packageRoot: string, readDirectory: (path: string) => string[] = readdirSync): ShardConfig[] {
  return readDirectory(packageRoot)
    .filter(name => /^tsconfig\.shard-.+\.json$/.test(name))
    .sort()
    .map(config => ({ name: config.slice("tsconfig.shard-".length, -".json".length), config }));
}
