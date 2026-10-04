/** Every root operand contributes exact native project membership before preparation. */
import { access, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { expect, it } from "vitest";
import { makeFocusedVitestFixture, runFocusedDiscoveryFixture } from "../helpers/focused-vitest-fixture.js";

const tree = "packages/arc-framework/__tests__/";

it.each([
  ["unit/named.test.mjs", ["__tests__/unit/named.test.mjs"]],
  ["unit/dir", ["__tests__/unit/dir/included.test.mjs"]],
] as const)("selects exactly %s without substring-adjacent files", async (operand, expected) => {
  const fixture = await makeFocusedVitestFixture();
  try {
    const result = await runFocusedDiscoveryFixture(fixture.packageRoot, [tree + operand]);
    expect(result.code, result.stderr).toBe(0);
    expect(result.stdout.split("\n").find((line) => line.startsWith("SELECTION:")))
      .toBe("SELECTION:" + JSON.stringify(expected));
    expect(result.stdout).toContain("RUNTIME:false");
  } finally { await rm(fixture.root, { recursive: true, force: true }); }
}, 30_000);

it.each(["unit/excluded.test.mjs", "unit/helper.mjs", "unit/empty"])("rejects %s even beside a valid operand", async (operand) => {
  const fixture = await makeFocusedVitestFixture();
  try {
    const result = await runFocusedDiscoveryFixture(fixture.packageRoot, [tree + "unit/named.test.mjs", tree + operand]);
    expect(result.code).toBe(1);
    expect(result.stdout + result.stderr).toContain(operand);
    for (const file of [".arc-build.lock", ".config-loads"]) {
      await expect(access(join(fixture.packageRoot, file))).rejects.toMatchObject({ code: "ENOENT" });
    }
    const events = await readFile(fixture.events, "utf8");
    expect(events).toContain("closed");
    expect(events).not.toContain("unit-setup");
    expect(await readFile(join(fixture.packageRoot, "dist/cli.js"), "utf8")).toContain("previous-live-runtime");
  } finally { await rm(fixture.root, { recursive: true, force: true }); }
}, 30_000);

it("requires each target to contribute after native project filtering", async () => {
  const fixture = await makeFocusedVitestFixture();
  try {
    const result = await runFocusedDiscoveryFixture(fixture.packageRoot,
      [tree + "unit/named.test.mjs", tree + "integration/runtime.test.mjs", "--project", "integration"]);
    expect(result.code).toBe(1);
    expect(result.stdout + result.stderr).toContain("unit/named.test.mjs");
    await expect(access(join(fixture.packageRoot, ".config-loads"))).rejects.toMatchObject({ code: "ENOENT" });
    expect(await readFile(fixture.events, "utf8")).not.toContain('"stage":"integration:setup"');
  } finally { await rm(fixture.root, { recursive: true, force: true }); }
}, 30_000);

it("retains every eligible operand and its native project after explicit filtering", async () => {
  const fixture = await makeFocusedVitestFixture();
  try {
    const result = await runFocusedDiscoveryFixture(fixture.packageRoot,
      [tree + "unit/named.test.mjs", tree + "integration/runtime.test.mjs", "--project", "unit", "--project", "integration"]);
    expect(result.code, result.stderr).toBe(0);
    expect(result.stdout.split("\n").find((line) => line.startsWith("SELECTION:"))).toBe("SELECTION:" + JSON.stringify([
      "__tests__/integration/runtime.test.mjs", "__tests__/unit/named.test.mjs",
    ]));
    expect(result.stdout).toContain("RUNTIME:true");
    expect(await readFile(fixture.events, "utf8")).not.toContain('"stage":"integration:setup"');
    await expect(access(join(fixture.packageRoot, ".config-loads"))).rejects.toMatchObject({ code: "ENOENT" });
  } finally { await rm(fixture.root, { recursive: true, force: true }); }
}, 30_000);
