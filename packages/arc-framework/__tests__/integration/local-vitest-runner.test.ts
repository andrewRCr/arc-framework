/** Supported tier execution observes native environment defaults before configuration. */
import { readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { expect, it } from "vitest";
import { makeVitestControllerFixture, runVitestControllerFixture } from "../helpers/vitest-controller-fixture.js";

it.each([undefined])("bootstraps config, setup, and workers with NODE_ENV=%s", async (nodeEnv) => {
  const fixture = await makeVitestControllerFixture();
  const expected = nodeEnv ?? "test";
  try {
    await writeFile(join(fixture.packageRoot, "tests/unit-environment.test.mjs"), `
import { it } from "vitest";
import { appendFileSync } from "node:fs";
it("worker environment", () => appendFileSync(${JSON.stringify(fixture.events)}, "worker:" +
  [process.env.TEST, process.env.VITEST, process.env.NODE_ENV].join(":") + "\\n"));
`);
    const result = await runVitestControllerFixture(fixture.packageRoot, ["full"],
      { TEST: undefined, VITEST: undefined, NODE_ENV: nodeEnv, CI: "", ARC_TEST_ALLOW_CONCURRENCY: "" });
    expect(result.code, result.stderr).toBe(0);
    const events = await readFile(fixture.events, "utf8");
    for (const stage of ["config", "unit-setup", "worker"]) expect(events).toContain(`${stage}:true:true:${expected}`);
    expect(events).toContain("closed");
    expect(events).not.toContain("integration-setup");
    expect(events.split("\n").filter((event) => event === "initialized")).toHaveLength(1);
  } finally { await rm(fixture.root, { recursive: true, force: true }); }
}, 30_000);
