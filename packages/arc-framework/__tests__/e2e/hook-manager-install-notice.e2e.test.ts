/** Hook-type configuration changes report the native installation command. */
import { afterEach, expect, it } from "vitest";
import { writeFile, readFile } from "node:fs/promises";
import { join } from "node:path";
import yaml from "js-yaml";
import { cleanupTempDir, createTempRepo, runArc } from "./helpers.js";
const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map(cleanupTempDir)); });

it.each(["init", "join"])("reports required hook installation after %s changes event types", async command => {
  const root = await createTempRepo();
  roots.push(root);
  const configPath = join(root, ".pre-commit-config.yaml");
  await writeFile(configPath, "repos: []\ndefault_install_hook_types: [post-checkout]\n");
  if (command === "join") {
    const initialized = await runArc(["init", "--yes", "--name", "hook-notice"], root);
    expect(initialized.exitCode, initialized.stderr).toBe(0);
    await writeFile(configPath, "repos: []\ndefault_install_hook_types: [post-checkout]\n");
  }
  const args = command === "init" ? ["init", "--yes", "--name", "hook-notice"] : ["join", "--yes"];
  const result = await runArc(args, root);
  expect(result.exitCode, result.stderr).toBe(0);
  expect(result.stdout).toContain("pre-commit install");
  expect(yaml.load(await readFile(configPath, "utf8"))).toMatchObject({
    default_install_hook_types: ["post-checkout", "pre-commit", "commit-msg", "pre-push"],
  });
  const repeated = await runArc(["join", "--yes"], root);
  expect(repeated.exitCode, repeated.stderr).toBe(0);
  expect(repeated.stdout).not.toContain("pre-commit install");
});
