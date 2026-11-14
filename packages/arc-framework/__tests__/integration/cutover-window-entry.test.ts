/** The repository-only source entry propagates refusals to the native process. */
import { resolve } from "node:path";
import { execa } from "execa";
import { expect, it, onTestFinished } from "vitest";
import { cleanupTempDir, createTempRepo } from "../helpers/integration.js";

const repository = resolve(import.meta.dirname, "../../../..");
const entry = resolve(import.meta.dirname, "../../src/scripts/cutover-window/main.ts");

it("exits nonzero with usage for an unsupported source operation", async () => {
  const target = await createTempRepo();
  onTestFinished(() => cleanupTempDir(target));
  const result = await execa(process.execPath, ["--import", "tsx", entry, "unknown", "--repo", target], {
    cwd: repository, reject: false, env: { FORCE_COLOR: undefined, NO_COLOR: "1" },
  });
  expect(result.exitCode).toBe(1);
  expect(result.stderr).toContain("Unsupported operation: unknown");
  expect(result.stderr).toContain("Usage:");
}, 15_000);

it("refuses an operation's unknown option with an options remedy and its usage", async () => {
  const { runWindow } = await import("../../src/scripts/cutover-window/main.js");
  const { closeWindow } = await import("../../src/scripts/cutover-window/close.js");
  const target = await createTempRepo();
  onTestFinished(() => cleanupTempDir(target));
  const stdout: string[] = [];
  const exit = await runWindow(["close", "--repo", target, "--json", "--bogus"], { close: closeWindow },
    { stdout: value => { stdout.push(value); }, stderr: () => undefined });
  expect({ exit, result: JSON.parse(stdout.join("")) as unknown }).toMatchObject({ exit: 1, result: { operation: "close", status: "refused",
    findings: [{ subject: "close options", condition: expect.stringContaining("--bogus"),
      remedy: "Correct the options (cutover-window close --repo <checkout> [--json] [operation options]), then retry." }] } });
}, 15_000);
