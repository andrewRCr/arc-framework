/** Ordered composition for repository worktree Markdown checks. */

import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const STAGES = ["lint:md:markdownlint", "lint:md:descriptors"] as const;

/** Run markdownlint before descriptor validation and stop at the first failure. */
export async function runMarkdownLintComposition(
  runStage: (stage: typeof STAGES[number]) => Promise<number>,
): Promise<number> {
  for (const stage of STAGES) {
    const exitCode = await runStage(stage);
    if (exitCode !== 0) return exitCode;
  }
  return 0;
}

function runNpmStage(stage: typeof STAGES[number]): Promise<number> {
  const npmCli = process.env.npm_execpath;
  const command = npmCli === undefined ? "npm" : process.execPath;
  const args = npmCli === undefined ? ["run", "-s", stage] : [npmCli, "run", "-s", stage];
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd: process.cwd(), stdio: "inherit" });
    child.once("error", reject);
    child.once("close", (code) => { resolve(code ?? 1); });
  });
}

/** Run the public composed Markdown command. */
export function main(): Promise<number> {
  return runMarkdownLintComposition(runNpmStage);
}

if (fileURLToPath(import.meta.url) === process.argv[1]) process.exitCode = await main();
