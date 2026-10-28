/** Sequential commands cannot silently consume a previous command's mutations of fixed inputs. */
import { afterEach, expect, it } from "vitest";
import { access, symlink } from "node:fs/promises";
import { join } from "node:path";
import { createRunnerCheckRepository } from "../fixtures/checks/runner.js";
import { removeGitBackedDirs } from "../helpers/temp-repo.js";
import { prepareSelectedCheckExecution } from "../../src/lib/checks/runner/execution.js";

const directories: string[] = [];
afterEach(async () => { await removeGitBackedDirs(directories.splice(0)); });

it.runIf(process.platform === "linux")("refuses an unavailable planned cwd before granting ready and permits a repaired plan", async () => {
  const fixture = await createRunnerCheckRepository(directories);
  const prepare = (cwd: string) => prepareSelectedCheckExecution({ ...fixture.input,
    buildPlan: () => ({ invocations: [{ id: "check", cwd, shell: false,
      argv: [process.execPath, "-e", "process.exit(0)"] }], probes: { global: [], check: [] } }),
  }, fixture.io);
  const unavailable = await prepare("missing-directory");
  if (unavailable.status === "ready") await unavailable.execution.close();
  expect(unavailable).toMatchObject({ status: "unavailable", reason: expect.stringContaining("missing-directory"),
    remedy: expect.stringContaining("retry") });
  for (const directory of fixture.captures) await expect(access(directory)).rejects.toThrow();
  const repaired = await prepare(".");
  if (repaired.status !== "ready") throw new Error(repaired.reason);
  try {
    expect((await repaired.execution.run("check")).outcomes.get("check")).toEqual({ status: "completed", exitCode: 0 });
  } finally { await repaired.execution.close(); }
});

it.runIf(process.platform === "linux")("accepts contained dangling and cyclic source links that capture certifies", async () => {
  const fixture = await createRunnerCheckRepository(directories, async root => {
    await Promise.all([symlink("absent.secret", join(root, "dangling")),
      symlink("loop-b", join(root, "loop-a")), symlink("loop-a", join(root, "loop-b"))]);
  });
  const prepared = await prepareSelectedCheckExecution({ ...fixture.input,
    buildPlan: () => ({ invocations: [{ id: "check", cwd: ".", shell: false,
      argv: [process.execPath, "-e", "process.exit(0)"] }], probes: { global: [], check: [] } }),
  }, fixture.io);
  if (prepared.status !== "ready") throw new Error(prepared.reason);
  try {
    expect((await prepared.execution.run("check")).outcomes.get("check")).toEqual({ status: "completed", exitCode: 0 });
  } finally { await prepared.execution.close(); }
});

it.runIf(process.platform === "linux")("executes the captured source after the caller repository is removed", async () => {
  const fixture = await createRunnerCheckRepository(directories);
  const chunks: Buffer[] = [];
  const prepared = await prepareSelectedCheckExecution({ ...fixture.input,
    buildPlan: () => ({ invocations: [{ id: "read", cwd: ".", shell: false,
      argv: [process.execPath, "-e", "process.stdout.write(require('node:fs').readFileSync('input.txt'))"] }],
    probes: { global: [], check: [] } }), onOutput: output => { chunks.push(Buffer.from(output.bytes)); },
  }, fixture.io);
  if (prepared.status !== "ready") throw new Error(prepared.reason);
  try {
    await removeGitBackedDirs([fixture.root]);
    const result = await prepared.execution.run("read");
    expect(result.outcomes.get("read")).toEqual({ status: "completed", exitCode: 0 });
    expect(Buffer.concat(chunks).toString("utf8")).toBe("captured source\r\n");
    await expect(prepared.execution.close()).resolves.toMatchObject({ status: "closed" });
  } finally { await prepared.execution.close(); }
});

it.runIf(process.platform === "linux")("lets a command refresh Git's index stat cache and add tool state before another planned command", async () => {
  const fixture = await createRunnerCheckRepository(directories);
  const refresh = `
    const { execFileSync } = require('node:child_process');
    const { mkdirSync } = require('node:fs');
    execFileSync('git', ['status', '--porcelain']);
    execFileSync('git', ['diff', '--name-only', '--', 'input.txt']);
    mkdirSync(execFileSync('git', ['rev-parse', '--path-format=absolute', '--git-common-dir'], { encoding: 'utf8' }).trim() + '/arc/test-suite', { recursive: true });
  `;
  const prepared = await prepareSelectedCheckExecution({ ...fixture.input,
    buildPlan: () => ({ invocations: [{ id: "status", cwd: ".", shell: false, argv: [process.execPath, "-e", refresh] },
      { id: "after", cwd: ".", shell: false, argv: [process.execPath, "-e", "process.exit(0)"] }], probes: { global: [], check: [] } }),
  }, fixture.io);
  if (prepared.status !== "ready") throw new Error(prepared.reason);
  try {
    expect((await prepared.execution.run("status")).outcomes.get("status")).toEqual({ status: "completed", exitCode: 0 });
    expect((await prepared.execution.run("after")).outcomes.get("after")).toEqual({ status: "completed", exitCode: 0 });
  } finally { await prepared.execution.close(); }
});

it.runIf(process.platform === "linux").each(["source", "new file", "Git index", "explicit file"])(
  "refuses %s mutation before another planned command and permits a fresh repaired attempt", async mutation => {
    const fixture = await createRunnerCheckRepository(directories);
    const marker = join(fixture.stateRoot, "second-started");
    const mutate = mutation === "source" ? "require('node:fs').writeFileSync('input.txt','changed')"
      : mutation === "new file" ? "require('node:fs').writeFileSync('generated.secret','new')"
      : mutation === "Git index" ? "require('node:child_process').execFileSync('git',['read-tree','--empty'])"
      : "require('node:fs').writeFileSync(process.env.EXPLICIT_FILE,'changed')";
    const reader = { id: "reader", cwd: ".", shell: false as const,
      argv: [process.execPath, "-e", `require('node:fs').writeFileSync(${JSON.stringify(marker)},'started')`] as [string, ...string[]] };
    const attempt = prepareSelectedCheckExecution({ ...fixture.input,
      buildPlan: () => ({ invocations: [{ id: "mutator", cwd: ".", shell: false,
        argv: [process.execPath, "-e", mutate] }, reader], probes: { global: [], check: [] } }),
    }, fixture.io);
    const prepared = await attempt;
    if (prepared.status !== "ready") throw new Error(prepared.reason);
    try {
      const first = await prepared.execution.run("mutator");
      expect(first.outcomes.get("mutator")).toEqual({ status: "completed", exitCode: 0 });
      const second = await prepared.execution.run("reader");
      expect(second.status).toBe("settled");
      expect(second.outcomes.get("reader")).toMatchObject({ status: "unavailable", remedy: expect.stringContaining("retry") });
      await expect(access(marker)).rejects.toThrow();
      await expect(prepared.execution.close()).resolves.toMatchObject({ status: "closed" });
    } finally { await prepared.execution.close(); }
    const retry = prepareSelectedCheckExecution({ ...fixture.input,
      buildPlan: () => ({ invocations: [reader], probes: { global: [], check: [] } }),
    }, fixture.io);
    expect(retry.planId).not.toBe(attempt.planId);
    const repaired = await retry;
    if (repaired.status !== "ready") throw new Error(repaired.reason);
    try {
      expect((await repaired.execution.run("reader")).outcomes.get("reader")).toEqual({ status: "completed", exitCode: 0 });
      await expect(access(marker)).resolves.toBeUndefined();
    } finally { await repaired.execution.close(); }
  });
