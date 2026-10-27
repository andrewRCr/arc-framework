/** Real detached descendants and failed protocol delivery exercise the standalone owner's lifetime. */
import { afterEach, expect, it } from "vitest";
import { readFile, writeFile, access } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { execFile, spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { promisify } from "node:util";
import { selectedExecutionFixture } from "../fixtures/checks/prepared-execution.js";
import { removeGitBackedDirs } from "../helpers/temp-repo.js";
import { prepareSelectedCheckExecution } from "../../src/lib/checks/runner/execution.js";
import { startCheckRunnerProcess, type CheckRunnerProcess } from "../../src/lib/checks/runner/session-process.js";
import { captureCheckExecutionInputs } from "../../src/lib/checks/runner/execution-inputs.js";

const example = fileURLToPath(new URL("../../examples/check-runner/local.mjs", import.meta.url));
const execFileAsync = promisify(execFile);
const directories: string[] = [];
const localIt = it.runIf(process.platform === "linux");
afterEach(async () => { await removeGitBackedDirs(directories.splice(0)); });

async function alive(pid: number): Promise<boolean> {
  const stat = await readFile(`/proc/${pid}/stat`, "utf8").catch(() => "");
  return stat !== "" && !["Z", "X"].includes(stat.slice(stat.lastIndexOf(")") + 2).split(" ")[0]!);
}

async function bounded<T>(promise: Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try { return await Promise.race([promise, new Promise<never>((_, reject) => {
    timer = setTimeout(() => { reject(new Error("Local example did not settle its owned work")); }, 5000);
  })]); } finally { clearTimeout(timer); }
}

localIt.each(["cancel", "EOF", "provider-settle"] as const)("waits for descendants whose native parent exited before %s settlement", async interruption => {
  const fixture = await selectedExecutionFixture(directories);
  const stateRoot = join(fixture.root, "adapter.secret");
  const gate = join(fixture.root, "child-exit.secret");
  const parentFile = join(fixture.root, "parent.secret");
  const childFile = join(fixture.root, "descendant.secret");
  const childScript = `${interruption === "provider-settle" ? "process.on('SIGTERM',()=>{});" : ""}
    const fs=require('node:fs');fs.writeFileSync(${JSON.stringify(childFile)},String(process.pid));
    const timer=setInterval(()=>{if(fs.existsSync(${JSON.stringify(gate)}))clearInterval(timer);},10);`;
  let port: CheckRunnerProcess | undefined;
  const attempt = prepareSelectedCheckExecution({ ...fixture.input,
    configuration: { file: fixture.input.configuration.file, argv: [process.execPath, example, "--state-root", stateRoot] },
    buildPlan: () => ({ invocations: [{ id: "check", cwd: ".", shell: false, argv: [process.execPath, "-e", `
      require('node:fs').writeFileSync(${JSON.stringify(parentFile)},String(process.pid));
      require('node:child_process').spawn(process.execPath,['-e',${JSON.stringify(childScript)}],{stdio:'ignore'}).unref();
    `] }], probes: { global: [], check: [] } }),
  }, { ...fixture.io, launch: input => { port = startCheckRunnerProcess(input); return port; } });
  const prepared = await attempt;
  if (prepared.status !== "ready") throw new Error(prepared.reason);
  const { execution } = prepared;
  const request = execution.run("check");
  let settled = false;
  void request.then(() => { settled = true; });
  let childPid: number | undefined;
  try {
    await expect.poll(() => readFile(childFile, "utf8").catch(() => ""), { timeout: 5000 }).toMatch(/^\d+$/u);
    childPid = Number(await readFile(childFile, "utf8"));
    const parentPid = Number(await readFile(parentFile, "utf8"));
    await expect.poll(() => alive(parentPid), { timeout: 5000 }).toBe(false);
    expect(await alive(childPid)).toBe(true);
    expect(settled).toBe(false);
    await expect(access(execution.source.root)).resolves.toBeUndefined();
    if (interruption === "cancel") await expect(execution.cancel()).resolves.toMatchObject({ accepted: true });
    else if (interruption === "EOF") port?.stdin.end();
    else {
      const settled = await execFileAsync(process.execPath, [example, "--settle", attempt.planId, "--state-root", stateRoot]);
      expect(JSON.parse(settled.stdout)).toMatchObject({ planId: attempt.planId, status: "settled" });
    }
    const result = await bounded(request);
    expect(result.status).toBe("settled");
    expect(result.outcomes.get("check")).toMatchObject({ status: "cancelled" });
    expect(await alive(childPid)).toBe(false);
    const closure = await execution.close();
    expect(closure.status).toBe(interruption === "cancel" ? "closed" : "uncertain");
    if (interruption !== "cancel") {
      const inspected = await execFileAsync(process.execPath, [example, "--inspect", attempt.planId, "--state-root", stateRoot]);
      expect(JSON.parse(inspected.stdout)).toMatchObject({ planId: attempt.planId, status: "settled" });
      const repeated = await execFileAsync(process.execPath, [example, "--settle", attempt.planId, "--state-root", stateRoot]);
      expect(JSON.parse(repeated.stdout)).toMatchObject({ planId: attempt.planId, status: "settled" });
      await expect(access(execution.source.root)).resolves.toBeUndefined();
    }
  } finally {
    await writeFile(gate, "settle");
    await bounded(request);
    await execution.close();
    if (childPid !== undefined) await expect.poll(() => alive(childPid!), { timeout: 5000 }).toBe(false);
  }
}, 15000);

localIt("launches no preparation child when the recovery output pipe refuses delivery", async () => {
  const fixture = await selectedExecutionFixture(directories);
  const marker = join(fixture.root, "probe-started.secret");
  const captured = await captureCheckExecutionInputs({ ...fixture.input,
    globalRuntimeInputs: [[process.execPath, "-e", `require('node:fs').writeFileSync(${JSON.stringify(marker)},'started')`]],
  }, fixture.io);
  const child = spawn(process.execPath, [example, "--known-node-runtime", "--state-root", join(fixture.root, "adapter.secret")],
    { cwd: fixture.root, stdio: ["pipe", "pipe", "pipe"] });
  const closed = new Promise<number | null>(resolve => { child.once("close", code => { resolve(code); }); });
  child.stderr.resume();
  child.stdin.on("error", () => undefined);
  child.stdout.destroy();
  child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", id: "prepare", method: "check/prepare", params: {
    protocolVersion: 1, planId: randomUUID(), source: { root: captured.source.root, manifest: captured.source.manifestPath,
      digest: captured.source.digest, coordinates: captured.source.manifest.coordinates }, environment: captured.environment.bindings,
    invocations: captured.plan.invocations, probes: captured.plan.probes,
  } })}\n`);
  try {
    expect(await bounded(closed)).not.toBe(0);
    await expect(access(marker)).rejects.toThrow();
  } finally {
    child.kill("SIGTERM");
    await bounded(closed);
    await captured.dispose();
  }
});
