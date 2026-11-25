/** Collect one command-start's file observations while its independent Git reads run. */
import { join } from "node:path";
import { readStat, readStatSync } from "./change-detection.js";
import type { FileStat } from "./index-schema.js";

/** Native observation boundaries; platform selection can be exercised without changing the host. */
export interface ProjectionStatOptions {
  readonly platform?: NodeJS.Platform;
  readonly read?: typeof readStat;
  readonly readSync?: typeof readStatSync;
}

/** Use synchronous stats on Linux/macOS and a bounded pool on Windows, draining every worker before returning. */
export async function readProjectionStats(checkout: string, files: readonly string[], options: ProjectionStatOptions = {}): Promise<ReadonlyMap<string, FileStat | null>> {
  const observed = new Map<string, FileStat | null>();
  if ((options.platform ?? process.platform) !== "win32") {
    for (const path of files) observed.set(path, (options.readSync ?? readStatSync)(join(checkout, path)));
    return observed;
  }
  let cursor = 0;
  const results = await Promise.allSettled(Array.from({ length: Math.min(32, files.length) }, async () => {
    for (let path = files[cursor++]; path !== undefined; path = files[cursor++]) {
      observed.set(path, await (options.read ?? readStat)(join(checkout, path)));
    }
  }));
  for (const result of results) if (result.status === "rejected") throw result.reason;
  return observed;
}
