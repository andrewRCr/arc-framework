/** Independent scripted executables preserve complete and incomplete group evidence through shared validators. */
import { afterEach, expect, it } from "vitest";
import { access, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { createRunnerCheckRepository } from "../fixtures/checks/runner.js";
import { preparedAdapterScript } from "../fixtures/checks/prepared-execution.js";
import { removeGitBackedDirs } from "../helpers/temp-repo.js";
import { prepareSelectedCheckExecution } from "../../src/lib/checks/runner/execution.js";

const directories: string[] = [];
afterEach(async () => { await removeGitBackedDirs(directories.splice(0)); });

it.each(["group", "group-loss", "group-malformed"] as const)("retains native failures and required binary output through %s", async mode => {
  const fixture = await createRunnerCheckRepository(directories);
  const executable = join(fixture.stateRoot, "scripted-adapter.cjs");
  const marker = join(fixture.stateRoot, "second-started");
  await writeFile(executable, preparedAdapterScript(mode));
  const bytes: Buffer[] = [];
  const prepared = await prepareSelectedCheckExecution({ ...fixture.input,
    configuration: { ...fixture.input.configuration, argv: [process.execPath, executable] },
    buildPlan: () => ({ invocations: [
      { id: "failed", cwd: ".", shell: false, argv: [process.execPath, "-e", "process.stdout.write(Buffer.from([0,255,13,10]));process.exit(7)"] },
      { id: "remaining", cwd: ".", shell: false, argv: [process.execPath, "-e", `require('node:fs').writeFileSync(${JSON.stringify(marker)},'started')`] },
    ], probes: { global: [], check: [] } }), onOutput: output => { bytes.push(Buffer.from(output.bytes)); },
  }, fixture.io);
  if (prepared.status !== "ready") throw new Error(prepared.reason);
  try {
    const result = await prepared.execution.runGroup(["failed", "remaining"]);
    expect(result.outcomes.get("failed")).toEqual({ status: "completed", exitCode: 7 });
    expect(Buffer.concat(bytes)).toEqual(Buffer.from([0, 255, 13, 10]));
    if (mode === "group") {
      expect(result.status).toBe("settled");
      expect(result.outcomes.get("remaining")).toEqual({ status: "completed", exitCode: 0 });
      await expect(access(marker)).resolves.toBeUndefined();
      await expect(prepared.execution.close()).resolves.toMatchObject({ status: "closed" });
    } else {
      expect(result.status).toBe("incomplete");
      expect(result.outcomes.has("remaining")).toBe(false);
      await expect(access(marker)).rejects.toThrow();
      const closure = await prepared.execution.close();
      expect(closure.status).toBe("uncertain");
      if (closure.status !== "uncertain") throw new Error("Missing group settlement must retain the capture");
      await expect(access(closure.retained.sourceRoot)).resolves.toBeUndefined();
      expect(prepared.execution.observedOutcomes.get("failed")).toEqual({ status: "completed", exitCode: 7 });
    }
  } finally { await prepared.execution.close(); }
});
