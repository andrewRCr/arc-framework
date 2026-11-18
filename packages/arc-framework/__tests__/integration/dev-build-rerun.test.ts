/** A stale development bundle rebuilds and hands the same command to a fresh process on the new build. */
import { spawn } from "node:child_process";
import { readFile, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { afterAll, beforeAll, expect, it } from "vitest";
import { TEST_CONTROLLER_TOKEN_ENV } from "../../src/lib/build-ownership.js";
import {
  checkDevBuildStaleness, createDevCheckDeps, DEV_BUILD_RERUN_ENV, refreshDevBuildAfterAction,
} from "../../src/lib/dev-check.js";
import { copyLiveDependencies } from "../helpers/copy-live-dependencies.js";
import { makeNativeBuildFixture } from "../helpers/native-build-fixture.js";

let root: string;
let packageRoot: string;
let cli: string;

/** A CLI that admits itself through the guard, then echoes its input under a label or waits to be ended. */
function runtime(label: string): string {
  return `
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createDevBuildGuardDeps, rerunDevCommand, runDevBuildGuard } from "./lib/dev-check.js";
const admission = await runDevBuildGuard({ commandPath: "arc marker" },
  createDevBuildGuardDeps(fileURLToPath(import.meta.url)));
if (admission.kind === "rerun") await rerunDevCommand();
if (process.argv[2] === "wait") {
  process.stdout.write(\`\${process.pid}\\n\`);
  setInterval(() => undefined, 1_000);
} else {
  process.stdout.write(\`${label}:\${readFileSync(0, "utf8")}\`);
  process.exitCode = Number(process.argv[2]);
}
`;
}

/** Run the built CLI as an ordinary command outside any test controller. */
function start(args: readonly string[]) {
  const env: NodeJS.ProcessEnv = { ...process.env, ARC_E2E_SKIP_BUILD: undefined, [DEV_BUILD_RERUN_ENV]: undefined,
    [TEST_CONTROLLER_TOKEN_ENV]: undefined };
  const child = spawn(process.execPath, [cli, ...args], { cwd: packageRoot, env, stdio: ["pipe", "pipe", "pipe"] });
  let stdout = "";
  let stderr = "";
  child.stdout.setEncoding("utf8").on("data", (chunk: string) => { stdout += chunk; });
  child.stderr.setEncoding("utf8").on("data", (chunk: string) => { stderr += chunk; });
  const ended = new Promise<{ code: number | null; signal: NodeJS.Signals | null; stdout: string; stderr: string }>(
    (settle) => { child.once("close", (code, signal) => { settle({ code, signal, stdout, stderr }); }); });
  return { child, ended, stdout: () => stdout };
}

function killIfRunning(pid: number): void {
  try { process.kill(pid, "SIGKILL"); } catch { /* Already ended. */ }
}

beforeAll(async () => {
  ({ root, packageRoot } = await makeNativeBuildFixture());
  cli = join(packageRoot, "dist/cli.js");
  await copyLiveDependencies(resolve(import.meta.dirname, "../.."), packageRoot, ["src/lib/dev-check.ts"]);
  await writeFile(join(packageRoot, "src/cli.ts"), runtime("first"));
  await expect(refreshDevBuildAfterAction(cli)).resolves.toEqual({ kind: "refreshed" });
}, 60_000);

afterAll(async () => { await rm(root, { recursive: true, force: true }); });

it("rebuilds a stale bundle and runs the command again with its input and exit status", async () => {
  await writeFile(join(packageRoot, "src/cli.ts"), runtime("second"));
  const run = start(["3"]);
  run.child.stdin.end("piped input");
  const result = await run.ended;
  expect(result).toMatchObject({ code: 3, signal: null, stdout: "second:piped input" });
  expect(result.stderr).toContain("info: rebuilding the stale arc dev build (");
  expect(result.stderr).not.toContain("Refusing");
  expect(checkDevBuildStaleness(createDevCheckDeps(cli))).toEqual({ kind: "fresh" });
}, 60_000);

it.skipIf(process.platform === "win32")(
  "ends the re-run when its parent is terminated and exits by the same signal",
  async () => {
    await writeFile(join(packageRoot, "src/cli.ts"), runtime("third"));
    const run = start(["wait"]);
    let rerunPid: number | undefined;
    try {
      await expect.poll(run.stdout, { timeout: 30_000 }).toMatch(/^\d+\n$/u);
      rerunPid = Number(run.stdout().trim());
      expect(rerunPid).not.toBe(run.child.pid);
      run.child.kill("SIGTERM");
      await expect(run.ended).resolves.toMatchObject({ code: null, signal: "SIGTERM" });
      expect(() => process.kill(rerunPid ?? 0, 0)).toThrow(expect.objectContaining({ code: "ESRCH" }));
    } finally {
      // A failed case must not leave the waiting CLI or its re-run running past the fixture.
      if (rerunPid !== undefined) killIfRunning(rerunPid);
      if (run.child.exitCode === null && run.child.signalCode === null) run.child.kill("SIGKILL");
      await run.ended;
    }
  },
  60_000,
);

it("refuses with the remedy and keeps the prior build when the rebuild fails", async () => {
  const prior = await readFile(cli, "utf8");
  await writeFile(join(packageRoot, "src/cli.ts"), "export const marker = ;");
  const run = start(["0"]);
  run.child.stdin.end();
  const result = await run.ended;
  expect(result).toMatchObject({ code: 1, signal: null, stdout: "" });
  expect(result.stderr).toContain("error: arc could not rebuild the dev build (the build exited with code 1).");
  expect(result.stderr).toContain("Refusing `arc marker` against stale dist; run `npm run build:fast`, then retry.");
  expect(await readFile(cli, "utf8")).toBe(prior);
}, 60_000);
