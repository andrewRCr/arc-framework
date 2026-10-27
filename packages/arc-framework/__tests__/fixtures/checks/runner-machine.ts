/** Isolated machine configuration for real CLI runner processes. */
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { join } from "node:path";
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
