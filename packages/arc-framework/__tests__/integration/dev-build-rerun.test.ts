/** A stale development bundle rebuilds and runs the same command again on the new build. */
import { spawn } from "node:child_process";
import { readFile, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { TEST_CONTROLLER_TOKEN_ENV, withBuildArtifactOwnership } from "../../src/lib/build-ownership.js";
import {
  checkDevBuildStaleness, createDevCheckDeps, DEV_BUILD_RERUN_ENV, refreshDevBuildAfterAction,
} from "../../src/lib/dev-check.js";
import { copyLiveDependencies } from "../helpers/copy-live-dependencies.js";
import { makeNativeBuildFixture } from "../helpers/native-build-fixture.js";

let root: string;
let packageRoot: string;
let cli: string;

/**
 * A CLI that admits itself through the guard, then echoes its input under a label, or prints its label and process ID
 * and waits for an interrupt or termination. A waiting CLI reports how many of that signal arrived within half a
 * second, then exits by it.
 */
function runtime(label: string): string {
  return `
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createDevBuildGuardDeps, rerunDevCommand, runDevBuildGuard } from "./lib/dev-check.js";
const admission = await runDevBuildGuard({ commandPath: "arc marker" },
  createDevBuildGuardDeps(fileURLToPath(import.meta.url)));
if (admission.kind === "rerun") await rerunDevCommand();
if (process.argv[2] === "wait") {
  for (const signal of ["SIGINT", "SIGTERM"]) {
    let count = 0;
    process.on(signal, () => {
      if (count++ > 0) return;
      setTimeout(() => {
        process.removeAllListeners(signal);
        process.stdout.write(\`\${signal} x\${count}\\n\`, () => { process.kill(process.pid, signal); });
      }, 500);
    });
  }
  process.stdout.write(\`${label} \${process.pid}\\n\`);
  setInterval(() => undefined, 1_000);
} else {
  process.stdout.write(\`${label}:\${readFileSync(0, "utf8")}\`);
  process.exitCode = Number(process.argv[2]);
}
`;
}

/**
 * Run the built CLI as an ordinary command outside any test controller. A grouped run leads its own process group,
 * with no controlling terminal, so cleanup can end it and everything it started together.
 */
function start(args: readonly string[], { grouped = false }: { grouped?: boolean } = {}) {
  const env: NodeJS.ProcessEnv = { ...process.env, ARC_E2E_SKIP_BUILD: undefined, [DEV_BUILD_RERUN_ENV]: undefined,
    [TEST_CONTROLLER_TOKEN_ENV]: undefined };
  const child = spawn(process.execPath, [cli, ...args],
    { cwd: packageRoot, env, stdio: ["pipe", "pipe", "pipe"], detached: grouped });
  let stdout = "";
  let stderr = "";
  child.stdout.setEncoding("utf8").on("data", (chunk: string) => { stdout += chunk; });
  child.stderr.setEncoding("utf8").on("data", (chunk: string) => { stderr += chunk; });
  const ended = new Promise<{ code: number | null; signal: NodeJS.Signals | null; stdout: string; stderr: string }>(
    (settle) => { child.once("close", (code, signal) => { settle({ code, signal, stdout, stderr }); }); });
  return { child, ended, stdout: () => stdout, stderr: () => stderr };
}

/** Settle with a run's end, or with "still running" if it has not ended within ten seconds. */
async function within(run: ReturnType<typeof start>) {
  return await Promise.race([run.ended, delay(10_000).then(() => "still running" as const)]);
}

/** Signal a grouped run's command alone, or its whole process group as a terminal does. */
function send(run: ReturnType<typeof start>, signal: NodeJS.Signals, target: "command" | "group"): void {
  const pid = run.child.pid ?? 0;
  process.kill(target === "group" ? -pid : pid, signal);
}

/** End a grouped run's whole process group, and wait a bounded time for its streams to close. */
async function endGroup(run: ReturnType<typeof start>): Promise<void> {
  const pid = run.child.pid;
  if (pid !== undefined) {
    try { process.kill(-pid, "SIGKILL"); } catch { /* The group has already ended. */ }
  }
  await within(run);
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

describe.skipIf(process.platform === "win32")("signals", () => {
  let run: ReturnType<typeof start> | undefined;

  // Cleanup runs here rather than in the case, because a case that times out never reaches its own cleanup.
  afterEach(async () => {
    if (run !== undefined) await endGroup(run);
    run = undefined;
  });

  it.each([
    ["SIGINT", "command"], ["SIGTERM", "command"], ["SIGINT", "group"], ["SIGTERM", "group"],
  ] as const)("deliver %s sent to the %s to the re-run once, and the command exits by it", async (signal, target) => {
    const label = `waiting-${signal}-${target}`;
    await writeFile(join(packageRoot, "src/cli.ts"), runtime(label));
    run = start(["wait"], { grouped: true });
    await expect.poll(run.stdout, { timeout: 30_000 }).toMatch(/\n$/u);
    // The rebuilt command replaced the stale one, keeping its process ID.
    expect(run.stdout()).toBe(`${label} ${String(run.child.pid)}\n`);
    send(run, signal, target);
    await expect(within(run)).resolves.toMatchObject({ code: null, signal,
      stdout: `${label} ${String(run.child.pid)}\n${signal} x1\n` });
  }, 60_000);

  it.each([
    ["SIGINT", "command"], ["SIGTERM", "command"], ["SIGINT", "group"],
  ] as const)("end the build the command waits on when %s is sent to the %s, and the command exits by it",
    async (signal, target) => {
      await writeFile(join(packageRoot, "src/cli.ts"), runtime(`held-${signal}-${target}`));
      const prior = await readFile(cli, "utf8");
      await withBuildArtifactOwnership({ packageRoot, operation: "a test hold" }, async () => {
        const held = start(["0"], { grouped: true });
        run = held;
        held.child.stdin.end();
        await expect.poll(held.stderr, { timeout: 30_000 }).toContain("Waiting for checkout artifacts held by a test hold");
        send(held, signal, target);
        // The build shares the command's standard error, so the streams close only once the build has ended too.
        await expect(within(held)).resolves.toMatchObject({ code: null, signal, stdout: "" });
      });
      expect(await readFile(cli, "utf8")).toBe(prior);
    }, 60_000);
});

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
