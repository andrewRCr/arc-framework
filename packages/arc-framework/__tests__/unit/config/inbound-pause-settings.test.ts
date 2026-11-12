/** Dormant scheduling settings are visible and validated through the config boundary. */
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it, onTestFinished } from "vitest";
import { runConfigStatus } from "../../../src/commands/config/status.js";
import { validateConfigFile } from "../../../src/commands/config/validate.js";

const defaults = {
  "inbound.retriage_after_entries": "10",
  "inbound.retriage_after_days": "30",
  "pause.review_after_days": "14",
};
it("shows the three dormant scheduling defaults in the full config view", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "arc-scheduling-config-"));
  onTestFinished(() => rm(cwd, { recursive: true, force: true }));
  const directory = join(cwd, ".arc", "system");
  await mkdir(directory, { recursive: true });
  await writeFile(join(directory, "arc-config.yml"), "");
  const result = await runConfigStatus({ cwd });
  expect(result.settings).toMatchObject(defaults);
  expect(result.defaultsApplied).toEqual(expect.arrayContaining(Object.keys(defaults)));
});
it.each(Object.keys(defaults))("validates only positive integers for %s", async (key) => {
  for (const value of ["0", "-1", "1.5", "nope"]) {
    const result = await validateConfigFile({ readPath: "/config.yml", displayPath: "config.yml",
      readFile: async () => `${key}: ${value}\n` });
    expect(result.errors, `${key}: ${value}`).toBeGreaterThan(0);
    expect(result.exitCode).toBe(2);
  }
  const result = await validateConfigFile({ readPath: "/config.yml", displayPath: "config.yml",
    readFile: async () => `${key}: 5\n` });
  expect(result.errors).toBe(0);
  expect(result.warnings).toBe(0);
});
