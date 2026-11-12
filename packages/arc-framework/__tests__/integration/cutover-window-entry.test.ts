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
