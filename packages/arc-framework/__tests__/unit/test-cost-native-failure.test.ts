/** Actual execution and closing failures cannot retain a passed measurement. */
import { access, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { expect, it } from "vitest";
import { makeNativeTestCostFixture, runNativeTestCostFixture } from "../helpers/test-cost-native-fixture.js";

it("retains no passed measurement after native global teardown logs a failure", async () => {
  const fixture = await makeNativeTestCostFixture();
  try {
    const setup = join(fixture.packageRoot, "tests/integration-setup.mjs");
    await writeFile(setup, (await readFile(setup, "utf8")).replace('return () => observe("teardown");',
      'return () => { observe("teardown"); throw new Error("measured teardown failure retained"); };'));
    const result = await runNativeTestCostFixture(fixture, "integration");
    expect(result.exitCode).toBe(1);
    expect(result.stdout + result.stderr).toContain("measured teardown failure retained");
    const events = await readFile(fixture.events, "utf8");
    expect(events).toContain('"stage":"integration:teardown"');
    expect(events).not.toContain('"owned":false');
    await expect(access(fixture.output)).rejects.toMatchObject({ code: "ENOENT" });
    await expect(access(join(fixture.packageRoot, ".arc-build.lock"))).rejects.toMatchObject({ code: "ENOENT" });
  } finally { await rm(fixture.root, { recursive: true, force: true }); }
}, 60_000);

it.each(["name-filter", "all-skipped"])("retains no passed measurement for zero completed %s cases", async (fault) => {
  const fixture = await makeNativeTestCostFixture();
  try {
    if (fault === "name-filter") {
      const configuration = join(fixture.packageRoot, "vitest.config.ts");
      await writeFile(configuration, (await readFile(configuration, "utf8")).replace('name: "unit",',
        'name: "unit", testNamePattern: "absent measured case",'));
    } else {
      for (const file of ["named.test.mjs", "named.test.mjs-adjacent.test.mjs", "dir/included.test.mjs", "dir-adjacent/sibling.test.mjs"]) {
        await writeFile(join(fixture.packageRoot, "__tests__/unit", file),
          'import { it } from "vitest"; it.skip("unfinished measured case", () => {});');
      }
    }
    const result = await runNativeTestCostFixture(fixture, "unit");
    expect(result.exitCode).toBe(1);
    expect(result.stdout + result.stderr).toContain("No test cases completed");
    expect(await readFile(fixture.events, "utf8")).toContain("closing-owned:false:false");
    await expect(access(fixture.output)).rejects.toMatchObject({ code: "ENOENT" });
    await expect(access(join(fixture.packageRoot, ".arc-build.lock"))).rejects.toMatchObject({ code: "ENOENT" });
  } finally { await rm(fixture.root, { recursive: true, force: true }); }
}, 60_000);

it("retains no passed measurement for a native failed case", async () => {
  const fixture = await makeNativeTestCostFixture();
  try {
    await writeFile(join(fixture.packageRoot, "__tests__/unit/named.test.mjs"),
      'import { it } from "vitest"; it("failed measured case", () => { throw new Error("native measured failure retained"); });');
    const result = await runNativeTestCostFixture(fixture, "unit");
    expect(result.exitCode).toBe(1);
    expect(result.stdout + result.stderr).toContain("native measured failure retained");
    expect(await readFile(fixture.events, "utf8")).toContain("closing-owned:false:false");
    await expect(access(fixture.output)).rejects.toMatchObject({ code: "ENOENT" });
  } finally { await rm(fixture.root, { recursive: true, force: true }); }
}, 60_000);

it("retains no passed measurement after native worker cleanup records a late error", async () => {
  const fixture = await makeNativeTestCostFixture();
  try {
    await writeFile(join(fixture.packageRoot, "tests/environment.mjs"), `export default {
      name: "measured-cleanup-failure", viteEnvironment: "ssr", setup() { return {
        teardown() { throw new Error("measured worker cleanup failure retained"); }
      }; }
    };`);
    const configuration = join(fixture.packageRoot, "vitest.config.ts");
    await writeFile(configuration, (await readFile(configuration, "utf8"))
      .replace("test: { watch:", "test: { dangerouslyIgnoreUnhandledErrors: true, watch:")
      .replace('name: "integration",', 'name: "integration", environment: "./tests/environment.mjs",'));
    const result = await runNativeTestCostFixture(fixture, "integration");
    expect(result.exitCode).toBe(1);
    expect(result.stdout + result.stderr).toContain("measured worker cleanup failure retained");
    expect(await readFile(fixture.events, "utf8")).toContain("closing-owned:true:false");
    await expect(access(fixture.output)).rejects.toMatchObject({ code: "ENOENT" });
    await expect(access(join(fixture.packageRoot, ".arc-build.lock"))).rejects.toMatchObject({ code: "ENOENT" });
  } finally { await rm(fixture.root, { recursive: true, force: true }); }
}, 60_000);
