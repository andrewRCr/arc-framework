/** Invoke Vitest's collecting list form to obtain effective CI E2E membership. */

import { readFile } from "node:fs/promises";
import { relative } from "node:path";

import { execa } from "execa";

import {
  parseWorkflowE2EShardCount,
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
}

export async function deriveEffectiveE2EShards(
  input: E2EShardRunInput,
  dependencies: E2EShardRunDependencies = DEFAULT_DEPENDENCIES,
): Promise<E2EShardMembership> {
  const shardCount = parseWorkflowE2EShardCount(await dependencies.readWorkflow(input.workflowPath));
  const tierArgs = ["list", "--project", "e2e"];
  const env = { ...input.env, ARC_E2E_SKIP_BUILD: "1" };
  const readMembership = async (args: readonly string[]): Promise<string[]> => {
    const result = await dependencies.execute(
      process.platform === "win32" ? "npx.cmd" : "npx",
      ["vitest", ...args, "--json"],
      { cwd: input.packageRoot, env },
    );
    return parseListedFiles(result.stdout, input.packageRoot);
  };
  const wholeTier = await readMembership(tierArgs);
  const legs = await Promise.all(
    Array.from({ length: shardCount }, async (_, index) => await readMembership([
      ...tierArgs,
      `--shard=${index + 1}/${shardCount}`,
    ])),
  );
  return validateE2EShardMembership(wholeTier, legs);
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
