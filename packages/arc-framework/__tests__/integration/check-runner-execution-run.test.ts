/** Prepared consumers share one complete plan and retain exact native child evidence. */
import { afterEach, expect, it } from "vitest";
import { removeGitBackedDirs } from "../helpers/temp-repo.js";
import { prepareSelectedCheckExecution } from "../../src/lib/checks/runner/execution.js";
import { selectedExecutionFixture } from "../fixtures/checks/prepared-execution.js";

const directories: string[] = [];
afterEach(async () => { await removeGitBackedDirs(directories.splice(0)); });

it.each(["execute", "group"] as const)("runs the fixed plan through %s and preserves failures beside completed work", async mode => {
  const fixture = await selectedExecutionFixture(directories, mode);
  const chunks: Buffer[] = [];
  const prepared = await prepareSelectedCheckExecution({ ...fixture.input,
    check: { ...fixture.input.check, mode: "project" },
    buildPlan: () => ({ invocations: [7, 0].map((code, index) => ({ id: `selected:${index}`, cwd: ".", shell: false,
      argv: [process.execPath, "-e", `process.stdout.write(Buffer.from([0,255,${index}]));process.exit(${code})`] })),
    probes: { global: [], check: [] } }),
    onOutput: output => { chunks.push(Buffer.from(output.bytes)); },
  }, fixture.io);
  expect(prepared.status).toBe("ready");
  if (prepared.status !== "ready") throw new Error(prepared.reason);
  const execution = prepared.execution;
  try {
    if (mode === "group") {
      const result = await execution.runGroup(execution.plan.invocations.map(invocation => invocation.id));
      expect(result.status).toBe("settled");
      expect(result.outcomes).toEqual(new Map([
        ["selected:0", { status: "completed", exitCode: 7 }], ["selected:1", { status: "completed", exitCode: 0 }],
      ]));
    } else {
      for (const [index, code] of [7, 0].entries()) {
        const result = await execution.run(`selected:${index}`);
        expect(result.status).toBe("settled");
        expect(result.outcomes).toEqual(new Map([[`selected:${index}`, { status: "completed", exitCode: code }]]));
      }
    }
    expect(execution.observedOutcomes.size).toBe(2);
    await expect(execution.close()).resolves.toMatchObject({ status: "closed" });
    expect(Buffer.concat(chunks).length).toBe(6);
    expect(chunks).toContainEqual(Buffer.from([0, 255, 0]));
    expect(chunks).toContainEqual(Buffer.from([0, 255, 1]));
  } finally { await execution.close(); }
});
