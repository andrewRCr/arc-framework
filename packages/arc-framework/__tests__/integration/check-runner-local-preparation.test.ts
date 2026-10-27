/** A real preparing probe retains plan ownership before a context or conversation can survive. */
import { afterEach, expect, it } from "vitest";
import { access, readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { selectedExecutionFixture } from "../fixtures/checks/prepared-execution.js";
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
