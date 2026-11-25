/** Unit admission decisions use fake native operations and an explicit file authority. */
import { expect, it } from "vitest";
import { readUnitProcessGuardInstallation } from "../helpers/unit-process-guard.js";
import { UNIT_PROCESS_ALLOWLIST } from "../helpers/unit-process-allowlist.js";
import { UnitProcessGuard } from "../helpers/unit-process-guard-core.js";

it("refuses a native launch from a file outside the allowlist", () => {
  const guard = new UnitProcessGuard("/fixture", ["allowed.test.ts"], () => "/fixture/blocked.test.ts");

  expect(() => guard.launch("spawn", () => "child started")).toThrow(/Unit process launch blocked/u);
});

it("preserves the admitted native operation's output", async () => {
  const guard = new UnitProcessGuard("/fixture", ["allowed.test.ts"], () => "/fixture/allowed.test.ts");

  await expect(guard.launch("execFile", async () => ({ stdout: "fixture\n", stderr: "" })))
    .resolves.toEqual({ stdout: "fixture\n", stderr: "" });
});

it("fails a test even when its helper caught the launch refusal", () => {
  const guard = new UnitProcessGuard("/fixture", [], () => "/fixture/blocked.test.ts");
  const before = guard.snapshot();
  try { guard.launch("spawn", () => "child started"); } catch { /* A helper swallowed the refusal. */ }

  expect(() => guard.assertNoBlockedSince(before)).toThrow(/Unit process launch blocked/u);
});

it("fails a file for a caught launch before the test starts", () => {
  const guard = new UnitProcessGuard("/fixture", [], () => "/fixture/blocked.test.ts");
  try { guard.launch("spawn", () => "child started"); } catch { /* The suite hook swallowed the refusal. */ }

  expect(() => guard.assertNoBlockedAtFileEnd()).toThrow(/Unit process launch blocked/u);
});

it("finds the repository allowlist installed by the shared unit setup", () => {
  expect(readUnitProcessGuardInstallation()).toEqual({ allowlist: [...UNIT_PROCESS_ALLOWLIST] });
});
