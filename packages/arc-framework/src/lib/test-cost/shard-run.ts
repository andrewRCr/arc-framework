/** Invoke Vitest's collecting list form to obtain effective CI E2E membership. */

import { readFile } from "node:fs/promises";
import { relative } from "node:path";

import { execa } from "execa";

import {
  parseWorkflowE2EExclusions,
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
}

export async function deriveEffectiveE2EShards(
  input: E2EShardRunInput,
  dependencies: E2EShardRunDependencies = DEFAULT_DEPENDENCIES,
): Promise<E2EShardMembership> {
  const workflow = await dependencies.readWorkflow(input.workflowPath);
  const exclusions = parseWorkflowE2EExclusions(workflow);
  const shardCount = input.shardCount ?? 4;
  if (!Number.isInteger(shardCount) || shardCount < 2) {
    throw new Error("E2E shard count must be an integer of at least two");
  }
  const commonArgs = [
    "list",
    "--project",
    "e2e",
    ...exclusions.flatMap((exclusion) => ["--exclude", exclusion]),
  ];
  const env = { ...input.env, ARC_E2E_SKIP_BUILD: "1" };
  const readMembership = async (shard?: string): Promise<string[]> => {
    const result = await dependencies.execute(
      process.platform === "win32" ? "npx.cmd" : "npx",
      ["vitest", ...commonArgs, ...(shard === undefined ? [] : [`--shard=${shard}`]), "--json"],
      { cwd: input.packageRoot, env },
    );
    return parseListedFiles(result.stdout, input.packageRoot);
  };
  const wholeTier = await readMembership();
  const legs = await Promise.all(
    Array.from({ length: shardCount }, async (_, index) => await readMembership(`${index + 1}/${shardCount}`)),
  );
  return validateE2EShardMembership(wholeTier, exclusions, legs);
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
