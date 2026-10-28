/** A real preparing probe retains plan ownership before a context or conversation can survive. */
import { afterEach, expect, it } from "vitest";
import { access, chmod, readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { randomUUID } from "node:crypto";
import { selectedExecutionFixture } from "../fixtures/checks/prepared-execution.js";
import { createRunnerCheckRepository } from "../fixtures/checks/runner.js";
import { removeGitBackedDirs } from "../helpers/temp-repo.js";
import { prepareSelectedCheckExecution } from "../../src/lib/checks/runner/execution.js";

const exampleURL = new URL("../../examples/check-runner/local.mjs", import.meta.url);
const example = fileURLToPath(exampleURL);
const execFileAsync = promisify(execFile);
const directories: string[] = [];
const localIt = it.runIf(process.platform === "linux");
afterEach(async () => { await removeGitBackedDirs(directories.splice(0)); });

async function alive(pid: number): Promise<boolean> {
  const stat = await readFile(`/proc/${pid}/stat`, "utf8").catch(() => "");
  return stat !== "" && !["Z", "X"].includes(stat.slice(stat.lastIndexOf(")") + 2).split(" ")[0]!);
}

localIt.each(["cancel", "lost frontend"] as const)("settles or retains preparation correctly after %s before context acquisition", async interruption => {
  const fixture = await selectedExecutionFixture(directories);
  const stateRoot = join(fixture.root, "adapter.secret");
  const frontend = join(fixture.root, "frontend.secret");
  const probeFile = join(fixture.root, "probe.secret");
  const gate = join(fixture.root, "probe-exit.secret");
  const wrapper = `
    require('node:fs').writeFileSync(${JSON.stringify(frontend)},String(process.pid));
    process.argv.splice(1,0,${JSON.stringify(example)},'--known-node-runtime','--state-root',${JSON.stringify(stateRoot)});
    import(${JSON.stringify(exampleURL.href)});
  `;
  const attempt = prepareSelectedCheckExecution({ ...fixture.input,
    configuration: { file: fixture.input.configuration.file, argv: [process.execPath, "-e", wrapper] },
    globalRuntimeInputs: [[process.execPath, "-e", `
      process.on('SIGTERM',()=>{});
      const fs=require('node:fs');fs.writeFileSync(${JSON.stringify(probeFile)},String(process.pid));
      const timer=setInterval(()=>{if(fs.existsSync(${JSON.stringify(gate)}))clearInterval(timer);},10);
    `]],
  }, fixture.io);
  let probePid: number | undefined;
  try {
    await expect.poll(() => readFile(probeFile, "utf8").catch(() => ""), { timeout: 5000 }).toMatch(/^\d+$/u);
    probePid = Number(await readFile(probeFile, "utf8"));
    expect(attempt.retained?.contextId).toBeUndefined();
    expect(attempt.retained?.recovery).toContain(`--inspect ${attempt.planId}`);
    if (interruption === "cancel") {
      await expect(attempt.cancel()).resolves.toEqual({ planId: attempt.planId, accepted: true });
      expect(await attempt).toMatchObject({ status: "unavailable", reason: "Preparation was cancelled" });
      expect(attempt.retained).toBeUndefined();
    } else {
      process.kill(Number(await readFile(frontend, "utf8")), "SIGKILL");
      const result = await attempt;
      expect(result.status).toBe("uncertain");
      if (result.status !== "uncertain") throw new Error("Lost preparation must retain its capture");
      expect(result.retained.contextId).toBeUndefined();
      await expect(access(result.retained.sourceRoot)).resolves.toBeUndefined();
      const settled = await execFileAsync(process.execPath, [example, "--settle", attempt.planId, "--state-root", stateRoot]);
      expect(JSON.parse(settled.stdout)).toMatchObject({ planId: attempt.planId, status: "settled" });
      expect(await alive(probePid)).toBe(false);
      await expect(access(result.retained.sourceRoot)).resolves.toBeUndefined();
    }
  } finally {
    await writeFile(gate, "settle");
    const result = await attempt;
    if (result.status === "ready") await result.execution.close();
    if (probePid !== undefined) await expect.poll(() => alive(probePid!), { timeout: 5000 }).toBe(false);
  }
}, 15000);

localIt("refuses a state root others can write, prepares after repair and settles an unrecorded plan", async () => {
  const fixture = await createRunnerCheckRepository(directories);
  const prepare = (stateRoot: string) => prepareSelectedCheckExecution({ ...fixture.input, configuration: {
    ...fixture.input.configuration, argv: [process.execPath, example, "--state-root", stateRoot] } }, fixture.io);
  await chmod(fixture.stateRoot, 0o777);
  for (const [stateRoot, reason] of [[fixture.stateRoot, "writable by no one else"], ["relative-state", "absolute directory"]] as const) {
    const refused = await prepare(stateRoot);
    if (refused.status === "ready") await refused.execution.close();
    expect(refused).toMatchObject({ status: "unavailable", reason: expect.stringContaining(reason) });
  }
  await chmod(fixture.stateRoot, 0o700);
  const repaired = await prepare(fixture.stateRoot);
  if (repaired.status !== "ready") throw new Error(repaired.reason);
  await expect(repaired.execution.close()).resolves.toMatchObject({ status: "closed" });
  const unrecorded = randomUUID();
  for (const operation of ["--inspect", "--settle"]) {
    const result = await execFileAsync(process.execPath, [example, operation, unrecorded, "--state-root", fixture.stateRoot]);
    expect(JSON.parse(result.stdout)).toEqual({ planId: unrecorded, status: "settled", workers: [] });
  }
});
