/** A stale development bundle rebuilds and runs the same command again on the new build. */
import { execFileSync, spawn } from "node:child_process";
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
let run: ReturnType<typeof start> | undefined;

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
 * Run the built CLI as an ordinary command outside any test controller. On POSIX it leads its own process group, with
 * no controlling terminal, so a case can signal that group as a terminal does. With `reportFlags`, a Linux shell runs
 * the command, then appends the file-status flags of the standard descriptors it shared with the command.
 */
function start(args: readonly string[], { reportFlags = false }: { reportFlags?: boolean } = {}) {
  const env: NodeJS.ProcessEnv = { ...process.env, ARC_E2E_SKIP_BUILD: undefined, [DEV_BUILD_RERUN_ENV]: undefined,
    [TEST_CONTROLLER_TOKEN_ENV]: undefined };
  const report = `for fd in 0 1 2; do printf ' %s' "$(sed -n 's/^flags:[[:space:]]*//p' /proc/$$/fdinfo/$fd)"; done`;
  const [file, ...argv] = reportFlags
    ? ["sh", "-c", `"$0" "$@"; ${report}`, process.execPath, cli, ...args]
    : [process.execPath, cli, ...args];
  const child = spawn(file ?? process.execPath, argv,
    { cwd: packageRoot, env, stdio: ["pipe", "pipe", "pipe"], detached: process.platform !== "win32" });
  let stdout = "";
  let stderr = "";
  child.stdout.setEncoding("utf8").on("data", (chunk: string) => { stdout += chunk; });
  child.stderr.setEncoding("utf8").on("data", (chunk: string) => { stderr += chunk; });
  const ended = new Promise<{ code: number | null; signal: NodeJS.Signals | null; stdout: string; stderr: string }>(
    (settle) => { child.once("close", (code, signal) => { settle({ code, signal, stdout, stderr }); }); });
  return { child, ended, stdout: () => stdout, stderr: () => stderr };
}

/** Settle with a run's end, or with "still running" if it has not ended in time. */
async function within(started: ReturnType<typeof start>, milliseconds = 10_000) {
  return await Promise.race([started.ended, delay(milliseconds).then(() => "still running" as const)]);
}

/** A run's end, failing the case if the run has not ended within 45 seconds. */
async function finished(started: ReturnType<typeof start>) {
  const result = await within(started, 45_000);
  if (result === "still running") throw new Error("the command was still running after 45 seconds");
  return result;
}

/** Signal a run's command alone, or its whole process group as a terminal does. */
function send(started: ReturnType<typeof start>, signal: NodeJS.Signals, target: "command" | "group"): void {
  const pid = started.child.pid ?? 0;
  process.kill(target === "group" ? -pid : pid, signal);
}

/** Processes whose command line names the fixture's package root, such as a build that leads its own group. */
function fixtureProcesses(): number[] {
  try {
    return execFileSync("pgrep", ["-f", packageRoot], { encoding: "utf8" }).split("\n").filter(Boolean).map(Number);
  } catch {
    return []; // pgrep exits non-zero when nothing matches.
  }
}

/**
 * End a run and everything it started, then wait a bounded time for its streams to close. On POSIX that is the
 * command's process group and every process running from the fixture, each with any group it leads.
 */
async function endRun(started: ReturnType<typeof start>): Promise<void> {
  if (process.platform === "win32") {
    started.child.kill();
  } else {
    for (const pid of [started.child.pid ?? 0, ...fixtureProcesses()].filter((id) => id > 0)) {
      for (const target of [-pid, pid]) {
        try { process.kill(target, "SIGKILL"); } catch { /* No such group, or it has already ended. */ }
      }
    }
  }
  await within(started);
}

beforeAll(async () => {
  ({ root, packageRoot } = await makeNativeBuildFixture());
  cli = join(packageRoot, "dist/cli.js");
  await copyLiveDependencies(resolve(import.meta.dirname, "../.."), packageRoot, ["src/lib/dev-check.ts"]);
  await writeFile(join(packageRoot, "src/cli.ts"), runtime("first"));
  await expect(refreshDevBuildAfterAction(cli)).resolves.toEqual({ kind: "refreshed" });
}, 60_000);

// Cleanup runs here rather than in a case, because a case that times out never reaches its own cleanup.
afterEach(async () => {
  if (run !== undefined) await endRun(run);
  run = undefined;
});

afterAll(async () => { await rm(root, { recursive: true, force: true }); });

it("rebuilds a stale bundle and runs the command again with its input and exit status", async () => {
  await writeFile(join(packageRoot, "src/cli.ts"), runtime("second"));
  run = start(["3"]);
  run.child.stdin.end("piped input");
  const result = await finished(run);
  expect(result).toMatchObject({ code: 3, signal: null, stdout: "second:piped input" });
  expect(result.stderr).toContain("info: rebuilding the stale arc dev build (");
  expect(result.stderr).not.toContain("Refusing");
  expect(checkDevBuildStaleness(createDevCheckDeps(cli))).toEqual({ kind: "fresh" });
}, 60_000);

it.skipIf(process.platform !== "linux")(
  "leaves the caller's standard descriptors in blocking mode after the re-run replaced the command",
  async () => {
    await writeFile(join(packageRoot, "src/cli.ts"), runtime("modes"));
    run = start(["0"], { reportFlags: true });
    run.child.stdin.end("input");
    const result = await finished(run);
    expect(result.stderr).toContain("info: rebuilding the stale arc dev build (");
    // The flags follow the command's output; 04000 is non-blocking mode.
    const flags = /^modes:input (\d+) (\d+) (\d+)$/u.exec(result.stdout)?.slice(1);
    expect(flags?.map((value) => Number.parseInt(value, 8) & 0o4000)).toEqual([0, 0, 0]);
  },
  60_000,
);

describe.skipIf(process.platform === "win32")("signals", () => {
  it.each([
    ["SIGINT", "command"], ["SIGTERM", "command"], ["SIGINT", "group"], ["SIGTERM", "group"],
  ] as const)("deliver %s sent to the %s to the re-run once, and the command exits by it", async (signal, target) => {
    const label = `waiting-${signal}-${target}`;
    await writeFile(join(packageRoot, "src/cli.ts"), runtime(label));
    const waiting = start(["wait"]);
    run = waiting;
    await expect.poll(waiting.stdout, { timeout: 30_000 }).toMatch(/\n$/u);
    // The rebuilt command replaced the stale one, keeping its process ID.
    expect(waiting.stdout()).toBe(`${label} ${String(waiting.child.pid)}\n`);
    send(waiting, signal, target);
    await expect(within(waiting)).resolves.toMatchObject({ code: null, signal,
      stdout: `${label} ${String(waiting.child.pid)}\n${signal} x1\n` });
  }, 60_000);

  it.each([
    ["SIGINT", "command"], ["SIGTERM", "command"], ["SIGINT", "group"],
  ] as const)("end the build the command waits on when %s is sent to the %s, and the command exits by it",
    async (signal, target) => {
      await writeFile(join(packageRoot, "src/cli.ts"), runtime(`held-${signal}-${target}`));
      const prior = await readFile(cli, "utf8");
      await withBuildArtifactOwnership({ packageRoot, operation: "a test hold" }, async () => {
        const held = start(["0"]);
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
  run = start(["0"]);
  run.child.stdin.end();
  const result = await finished(run);
  expect(result).toMatchObject({ code: 1, signal: null, stdout: "" });
  expect(result.stderr).toContain("error: arc could not rebuild the dev build (the build exited with code 1).");
  expect(result.stderr).toContain("Refusing `arc marker` against stale dist; run `npm run build:fast`, then retry.");
  expect(await readFile(cli, "utf8")).toBe(prior);
}, 60_000);
