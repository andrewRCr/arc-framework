/** Isolated machine configuration for real CLI runner processes. */
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import { tmpdir } from "node:os";

/** Write literal machine argv outside the source repository and register its cleanup. */
export async function createRunnerMachineHome(directories: string[], argv: readonly string[]): Promise<{
  home: string; environment: NodeJS.ProcessEnv;
}> {
  const home = await mkdtemp(join(tmpdir(), "arc-runner-machine-"));
  directories.push(home);
  await mkdir(join(home, ".arc"));
  await writeFile(join(home, ".arc/config.yml"), JSON.stringify({ "checks.runner": argv }));
  return { home, environment: { HOME: home, USERPROFILE: home, GIT_CONFIG_NOSYSTEM: "1" } };
}

/** Register recorded source captures only after the controlled fixture's provider process has closed. */
export async function registerRunnerFixtureSources(directories: string[], receipt: string): Promise<void> {
  for (const line of (await readFile(receipt, "utf8")).trim().split("\n").filter(Boolean)) {
    const source: unknown = JSON.parse(line);
    if (typeof source !== "object" || source === null || !("manifest" in source) || typeof source.manifest !== "string") {
      throw new Error("Expected a recorded source manifest location");
    }
    const directory = dirname(source.manifest);
    if (!basename(directory).startsWith("arc-check-source-") || dirname(directory) !== tmpdir()) {
      throw new Error("Recorded capture does not belong to the fixture's source allocator");
    }
    if (!directories.includes(directory)) directories.push(directory);
  }
}
