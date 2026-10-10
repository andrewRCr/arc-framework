/** Existing generated manager configurations upgrade through the installed CLI. */
import { afterEach, expect, it } from "vitest";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import yaml from "js-yaml";
import { cleanupTempDir, createTempRepo, runArc } from "./helpers.js";

const roots: string[] = [];
const managers = ["lefthook", "pre-commit"] as const;
type Manager = typeof managers[number];
interface Config {
  "pre-push"?: { commands: Record<string, { run: string; use_stdin?: boolean }> };
  default_install_hook_types?: string[];
  repos?: { repo: string; hooks: { id: string; entry: string; files?: string; always_run?: boolean; pass_filenames?: boolean; require_serial?: boolean }[] }[];
}
afterEach(async () => { await Promise.all(roots.splice(0).map(cleanupTempDir)); });

async function installed(manager: Manager): Promise<{ root: string; path: string; config: Config }> {
  const root = await createTempRepo("arc-update-hooks-");
  roots.push(root);
  const path = join(root, manager === "lefthook" ? "lefthook.yml" : ".pre-commit-config.yaml");
  await writeFile(path, manager === "lefthook" ? "{}\n" : "repos: []\n");
  const init = await runArc(["init", "--yes", "--name", "update-hook-test"], root);
  expect(init.exitCode, init.stdout + init.stderr).toBe(0);
  return { root, path, config: yaml.load(await readFile(path, "utf8")) as Config };
}

it.each(managers)("upgrades generated %s entries and names the rewritten configuration", async manager => {
  const { root, path, config } = await installed(manager);
  if (manager === "lefthook") delete config["pre-push"]!.commands["arc-pre-push"]!.use_stdin;
  else {
    delete config.default_install_hook_types;
    for (const hook of config.repos!.flatMap(repo => repo.hooks)) {
      delete hook.always_run;
      delete hook.pass_filenames;
      delete hook.require_serial;
      if (hook.id === "arc-commit-msg") hook.files = "^$";
    }
  }
  await writeFile(path, yaml.dump(config));
  const update = await runArc(["update", "--quiet"], root);
  expect(update.exitCode, update.stdout + update.stderr).toBe(0);
  const upgraded = yaml.load(await readFile(path, "utf8")) as Config;
  if (manager === "lefthook") expect(upgraded["pre-push"]!.commands["arc-pre-push"]!.use_stdin).toBe(true);
  else {
    const hooks = upgraded.repos!.flatMap(repo => repo.hooks);
    expect(hooks.find(hook => hook.id === "arc-pre-commit")).toMatchObject({ always_run: true, pass_filenames: false, require_serial: true });
    expect(hooks.find(hook => hook.id === "arc-commit-msg")).not.toHaveProperty("files");
    expect(hooks.find(hook => hook.id === "arc-pre-push")).toMatchObject({ always_run: true });
    expect(upgraded.default_install_hook_types).toEqual(["pre-commit", "commit-msg", "pre-push"]);
    expect(update.stdout + update.stderr).toContain("Run pre-commit install");
  }
  expect(update.stdout + update.stderr).toContain(path);
}, 60_000);

it.each(managers)("preserves a custom %s entry and reports it in the update summary", async manager => {
  const { root, path, config } = await installed(manager);
  if (manager === "lefthook") config["pre-push"]!.commands["arc-pre-push"]!.run = "personal-push-check";
  else config.repos!.flatMap(repo => repo.hooks).find(hook => hook.id === "arc-pre-push")!.entry = "personal-push-check";
  const content = "# Personal configuration\n" + yaml.dump(config);
  await writeFile(path, content);
  const update = await runArc(["update", "--quiet"], root);
  expect(update.exitCode, update.stdout + update.stderr).toBe(0);
  expect(await readFile(path, "utf8")).toBe(content);
  expect(update.stdout + update.stderr).toContain(path);
  expect(update.stdout + update.stderr).toContain("arc-pre-push is not a recognized generated entry");
}, 60_000);

it.each(["husky", "no manager"])("leaves an install with %s unaffected by hook upgrades", async manager => {
  const root = await createTempRepo("arc-update-hooks-");
  roots.push(root);
  if (manager === "husky") await mkdir(join(root, ".husky"));
  const init = await runArc(["init", "--yes", "--name", "update-hook-test"], root);
  expect(init.exitCode, init.stdout + init.stderr).toBe(0);
  const huskyPath = join(root, ".husky/pre-push");
  const custom = "#!/bin/sh\npersonal-push-check\n";
  if (manager === "husky") await writeFile(huskyPath, custom);
  const update = await runArc(["update", "--quiet"], root);
  expect(update.exitCode, update.stdout + update.stderr).toBe(0);
  expect(existsSync(join(root, "lefthook.yml"))).toBe(false);
  expect(existsSync(join(root, ".pre-commit-config.yaml"))).toBe(false);
  if (manager === "husky") expect(await readFile(huskyPath, "utf8")).toBe(custom);
  expect(update.stdout + update.stderr).not.toContain("Hook configurations upgraded");
  expect(update.stdout + update.stderr).not.toContain("Hook upgrade warnings");
}, 60_000);

it.each(managers)("reports malformed %s configuration, completes file updates, and retries after repair", async manager => {
  const { root, path, config } = await installed(manager);
  const hookPath = join(root, ".arc/system/.internal/githooks/pre-push");
  const hook = await readFile(hookPath, "utf8");
  await writeFile(hookPath, "obsolete framework hook\n");
  await writeFile(path, "repos: [\n");
  const update = await runArc(["update", "--quiet"], root);
  expect(update.exitCode, update.stdout + update.stderr).toBe(0);
  expect(await readFile(hookPath, "utf8")).toBe(hook);
  expect(await readFile(path, "utf8")).toBe("repos: [\n");
  expect(update.stdout + update.stderr).toContain(path);
  expect(update.stdout + update.stderr).toContain("repair the configuration and retry arc update");
  await writeFile(path, yaml.dump(config));
  const repaired = await runArc(["update", "--quiet"], root);
  expect(repaired.exitCode, repaired.stdout + repaired.stderr).toBe(0);
  expect(repaired.stdout + repaired.stderr).not.toContain("Hook upgrade warnings");
  expect(yaml.load(await readFile(path, "utf8"))).toEqual(config);
}, 60_000);
