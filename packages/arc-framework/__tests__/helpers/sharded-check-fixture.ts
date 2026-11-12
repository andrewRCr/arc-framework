/** Disposable declared checks and wire-observing adapters for complete consumer scenarios. */
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { createDeclaredCheckRepository } from "../fixtures/checks/repository.js";
import { preparedAdapterScript, type PreparedAdapterMode } from "../fixtures/checks/prepared-execution.js";
import { createRunnerMachineHome } from "../fixtures/checks/runner-machine.js";
import { RunnerRequestSchema, type RunnerRequest } from "../../src/lib/checks/runner/contract.js";

/** Create one ordinary selected check, allowing native declaration differences at the test boundary. */
export async function createShardedCheckFixture(directories: string[], input: {
  mode: PreparedAdapterMode; program: string; check?: Record<string, unknown>; definition?: Record<string, unknown>;
}) {
  const machine = await createRunnerMachineHome(directories, [process.execPath]);
  const adapter = join(machine.home, "adapter.cjs");
  await writeFile(adapter, preparedAdapterScript(input.mode, undefined, machine.home));
  const configuration = join(machine.home, ".arc/config.yml");
  await writeFile(configuration, JSON.stringify({ "checks.runner": [process.execPath, adapter] }));
  const root = await createDeclaredCheckRepository({ example: { runner: true, mode: "files", pass_paths: false,
    cache: false, inputs: ["src/**"], command: [process.execPath, "capture.cjs"],
    shards: { count: 3, argument: "--shard={index}/{count}", routed: true }, ...input.check,
  } }, { global_inputs: ["capture.cjs"], ...input.definition });
  directories.push(root);
  await writeFile(join(root, "capture.cjs"), input.program);
  return { root, adapter, configuration, ...machine };
}

/** Parse real request frames recorded at the independent subprocess's public wire boundary. */
export async function readShardedCheckRequests(home: string): Promise<RunnerRequest[]> {
  return (await readFile(join(home, "requests"), "utf8")).trim().split("\n")
    .map(line => RunnerRequestSchema.parse(JSON.parse(line)));
}
