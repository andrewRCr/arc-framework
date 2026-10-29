/** The shipping store declaration forms native shard plans with frozen selector and duration inputs. */
import { afterEach, expect, it } from "vitest";
import { readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { selectedExecutionFixture } from "../fixtures/checks/prepared-execution.js";
import { removeGitBackedDirs } from "../helpers/temp-repo.js";
import { CheckDeclarationSchema } from "../../src/lib/checks/declaration.js";
import { readTypedProjectFile } from "../../src/lib/config/typed-file-reader.js";
import { resolveCheckForecast } from "../../src/lib/checks/forecast.js";
import { bindCapturedEnvironment } from "../../src/lib/checks/environment-inputs.js";
import { prepareSelectedCheckExecution } from "../../src/lib/checks/runner/execution.js";
import { planCheckExecution } from "../../src/lib/checks/runner/planning.js";

const directories: string[] = [];
afterEach(async () => { await removeGitBackedDirs(directories.splice(0)); });

it.each(["unset", "empty", "zero-byte", "recorded"] as const)(
  "plans the native store matrix with captured %s duration input", async state => {
    const root = resolve(import.meta.dirname, "../../../..");
    const loaded = await readTypedProjectFile(root, "check-declaration", CheckDeclarationSchema);
    if (loaded.status !== "valid") throw new Error("Cannot read shipping check declaration");
    const check = loaded.value.checks["test:store"]!;
    const fixture = await selectedExecutionFixture(directories);
    const source = join(fixture.stateRoot, "duration.input");
    const contents = state === "recorded" ? '{"results":[["integration:example.test.ts",{"duration":31}]]}' : "";
    await writeFile(source, contents);
    const environment = { ARC_STORE_CHECK: "every", ARC_STORE_BURSTS: "",
      ...(state === "unset" ? {} : { ARC_TEST_DURATION_FILE: state === "empty" ? "" : source }) };
    const prepared = await prepareSelectedCheckExecution({ ...fixture.input, check, environment,
      buildPlan: context => planCheckExecution({ callerRoot: fixture.root, source: context.source, paths: context.paths, check }),
    }, fixture.io);
    if (prepared.status !== "ready") throw new Error(prepared.reason);
    try {
      const forecast = resolveCheckForecast(check, root, ["packages/arc-framework/src/lib/store/ref/read.ts"], process.platform);
      const argv = ["node", "--import", "tsx", "scripts/run-reach-check.mjs",
        "packages/arc-framework/__tests__/reach/store-suites.json"];
      const expected = [1, 2, 3, 4].map(index => [...argv, `--shard=${index}/4`]);
      expect(prepared.execution.plan.invocations.map(invocation => invocation.argv)).toEqual(expected);
      expect(forecast.shards?.flatMap(shard => shard.batches)).toEqual(expected);
      await writeFile(source, "later caller edits");
      const replay = bindCapturedEnvironment(prepared.execution.environment,
        { ARC_STORE_CHECK: "full", ARC_STORE_BURSTS: "1", ARC_TEST_DURATION_FILE: source });
      expect(replay.ARC_STORE_CHECK).toBe("every");
      expect(replay.ARC_STORE_BURSTS).toBe("");
      if (state === "unset") expect(Object.hasOwn(replay, "ARC_TEST_DURATION_FILE")).toBe(false);
      else if (state === "empty") expect(replay.ARC_TEST_DURATION_FILE).toBe("");
      else {
        expect(replay.ARC_TEST_DURATION_FILE).not.toBe(source);
        expect(await readFile(replay.ARC_TEST_DURATION_FILE!, "utf8")).toBe(contents);
      }
    } finally { await prepared.execution.close(); }
  }, 30_000,
);
