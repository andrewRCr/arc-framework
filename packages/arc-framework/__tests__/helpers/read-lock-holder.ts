/** Tolerate a renewing lock's temporary empty or partial record in fixture assertions. */
import { readFile } from "node:fs/promises";
import { classifyAdvisoryLockRead, type AdvisoryLockHolder } from "../../src/lib/advisory-lock.js";

interface ReadLockOptions {
  readonly readFile?: (path: string) => Promise<string>;
  readonly sleep?: (ms: number) => Promise<void>;
  readonly attempts?: number;
}

/**
 * Read a live fixture holder, retrying only empty or malformed observations.
 * @param path - Lockfile expected to have a live holder
 * @param options - File-reading and retry boundaries for deterministic tests
 * @returns The parsed holder after its record settles
 */
export async function readSettledLockHolder(path: string, options: ReadLockOptions = {}): Promise<AdvisoryLockHolder> {
  const read = options.readFile ?? (async (file: string) => await readFile(file, "utf8"));
  const sleep = options.sleep ?? (async (ms: number) => await new Promise<void>((resolve) => setTimeout(resolve, ms)));
  const attempts = options.attempts ?? 50;
  for (let attempt = 0; attempt < attempts; attempt++) {
    let observation: Parameters<typeof classifyAdvisoryLockRead>[0];
    try { observation = { text: await read(path) }; }
    catch (error) { observation = { error }; }
    const holder = classifyAdvisoryLockRead(observation);
    if (typeof holder === "object") return holder;
    if (holder !== "empty" && holder !== "corrupt") throw new Error(`Expected a holder in ${path}; observed ${holder}.`);
    if (attempt + 1 < attempts) await sleep(2);
  }
  throw new Error(`Lock record did not settle after ${attempts} reads: ${path}`);
}
