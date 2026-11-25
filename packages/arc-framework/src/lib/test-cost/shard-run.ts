/** Invoke Vitest's collecting list form to obtain effective CI E2E membership. */

import { readFile } from "node:fs/promises";
import { relative, resolve } from "node:path";

import { execa } from "execa";

import {
  parseWorkflowE2EShards,
  validateE2EShardMembership,
  type E2EShardMembership,
} from "./shards.js";

export interface E2EShardRunDependencies {
  readonly execute: (
    command: string,
    args: readonly string[],
    options: { cwd: string; env: Readonly<Record<string, string | undefined>> },
  ) => Promise<{ stdout: string }>;
  readonly readWorkflow: (path: string) => Promise<string>;
}

export interface E2EShardRunInput {
  readonly packageRoot: string;
  readonly workflowPath: string;
  readonly env: Readonly<Record<string, string | undefined>>;
  readonly shardCount?: number;
  readonly durationFile?: string;
}

export async function deriveEffectiveE2EShards(
  input: E2EShardRunInput,
  dependencies: E2EShardRunDependencies = DEFAULT_DEPENDENCIES,
): Promise<E2EShardMembership> {
  const shards = parseWorkflowE2EShards(await dependencies.readWorkflow(input.workflowPath));
  const count = input.shardCount ?? shards.length;
  if (count !== shards.length) throw new Error(`CI workflow declares ${shards.length} E2E shards, not ${count}`);
  const args = ["list", "--project", "e2e"];
  const env = { ...input.env, ARC_E2E_SKIP_BUILD: "1",
    ARC_TEST_DURATION_FILE: input.durationFile === undefined ? input.env["ARC_TEST_DURATION_FILE"] : resolve(input.durationFile) };
  const readMembership = async (selection: readonly string[]): Promise<string[]> => {
    const result = await dependencies.execute(process.platform === "win32" ? "npx.cmd" : "npx",
      ["vitest", ...selection, "--json"], { cwd: input.packageRoot, env });
    return parseListedFiles(result.stdout, input.packageRoot);
  };
  const whole = await readMembership(args);
  const legs = await Promise.all(shards.map((shard) => readMembership([...args, `--shard=${shard}/${count}`])));
  return validateE2EShardMembership(whole, legs);
}

const DEFAULT_DEPENDENCIES: E2EShardRunDependencies = {
  execute: async (command, args, options) => {
    const result = await execa(command, args, { cwd: options.cwd, env: options.env });
    return { stdout: result.stdout };
  },
  readWorkflow: async (path) => await readFile(path, "utf8"),
};

function parseListedFiles(stdout: string, packageRoot: string): string[] {
  const parsed: unknown = JSON.parse(stdout);
  if (!Array.isArray(parsed) || parsed.length === 0) {
    throw new Error("Vitest list returned no E2E test cases");
  }
  const entries: readonly unknown[] = parsed;
  const files = entries.map((entry) => {
    if (typeof entry !== "object" || entry === null) {
      throw new Error("Vitest list returned an invalid E2E test record");
    }
    const file = (entry as Readonly<Record<string, unknown>>)["file"];
    if (typeof file !== "string") throw new Error("Vitest list returned an invalid E2E test record");
    return relative(packageRoot, file).replaceAll("\\", "/");
  });
  return [...new Set(files)].sort();
}
