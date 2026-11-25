/** Facade dispatch respects advertised groups and never repeats fixed invocation IDs. */
import { afterEach, expect, it } from "vitest";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { removeGitBackedDirs } from "../helpers/temp-repo.js";
import { prepareSelectedCheckExecution } from "../../src/lib/checks/runner/execution.js";
import { selectedExecutionFixture } from "../fixtures/checks/prepared-execution.js";

const directories: string[] = [];
afterEach(async () => { await removeGitBackedDirs(directories.splice(0)); });

it.each(["execute", "group"] as const)("refuses repeated IDs through %s while allowing remaining planned singles", async mode => {
  const fixture = await selectedExecutionFixture(directories, mode);
  const marker = join(fixture.root, "launches.secret");
  const prepared = await prepareSelectedCheckExecution({ ...fixture.input,
    buildPlan: () => ({ invocations: ["first", "second"].map(id => ({ id, cwd: ".", shell: false,
      argv: [process.execPath, "-e", `require('node:fs').appendFileSync(${JSON.stringify(marker)},${JSON.stringify(id + "\n")})`] })),
    probes: { global: [], check: [] } }),
  }, fixture.io);
  if (prepared.status !== "ready") throw new Error(prepared.reason);
  const { execution } = prepared;
  try {
    if (mode === "execute") await expect(execution.runGroup(["first", "second"])).resolves.toMatchObject({
      status: "incomplete", reason: expect.stringContaining("not advertised") });
    await expect(execution.run("first")).resolves.toMatchObject({ status: "settled" });
    const repeated = mode === "group" ? execution.runGroup(["first", "second"]) : execution.run("first");
    await expect(repeated).resolves.toMatchObject({ status: "incomplete", reason: expect.stringContaining("already requested") });
    expect(await readFile(marker, "utf8")).toBe("first\n");
    await expect(execution.run("second")).resolves.toMatchObject({ status: "settled" });
    expect(await readFile(marker, "utf8")).toBe("first\nsecond\n");
    expect(execution.observedOutcomes.size).toBe(2);
    await expect(execution.close()).resolves.toMatchObject({ status: "closed" });
  } finally { await execution.close(); }
});
