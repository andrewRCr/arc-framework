/** Existing generated manager configurations upgrade through the installed CLI. */
import { afterEach, expect, it } from "vitest";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import yaml from "js-yaml";
import type { FileEntry, Manifest } from "../../src/lib/types.js";
import { CheckDeclarationSchema } from "../../src/lib/checks/declaration.js";
import { editorDocumentReference } from "../../src/lib/schema-command/editor-documents.js";
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

it("preserves retired check sources and proposes inactive checks while upgrading hooks in the same update", async () => {
  const { root, path, config } = await installed("lefthook");
  const arcDir = join(root, ".arc");
  const manifestPath = join(arcDir, "system/.internal/manifest.json");
  const pristinePath = join(arcDir, "system/.internal/pristine.json");
  const manifest = JSON.parse(await readFile(manifestPath, "utf8")) as Manifest;
  const pristine = JSON.parse(await readFile(pristinePath, "utf8")) as Record<string, string>;
  const retiredSurfaces = JSON.parse(await readFile(new URL("../fixtures/retired-check-surfaces.json", import.meta.url), "utf8")) as Record<string, { entry: FileEntry; content: string }>;
  const authored: Record<string, string> = {};
  for (const [source, legacy] of Object.entries(retiredSurfaces)) {
    manifest.files[source] = legacy.entry;
    pristine[source] = legacy.content;
    const name = source.split("/").at(-1)!.replace(".md", "");
    const method = source.includes("/methods/");
    const command = method ? "npm run build" : name === "post-task-quality" ? "npm run security" : "npm test";
    authored[source] = `---\nname: ${name}\ndescription: Project checks\n${method ? "override-active: true" : "active: false"}\n---\n`
      + `## ${name}.${method ? "override" : "actions"}\n${method ? "### Tier 3 full\n" : ""}`
      + `\`\`\`bash\n${command}\n\`\`\`\n`
      + (name === "post-task-quality" ? "Inspect the security dashboard.\n" : "");
    await writeFile(join(arcDir, source), authored[source]!);
  }
  await writeFile(manifestPath, JSON.stringify(manifest));
  await writeFile(pristinePath, JSON.stringify(pristine));
  const quickPath = "reference/QUICK-REFERENCE.md";
  await writeFile(join(arcDir, quickPath), (await readFile(join(arcDir, quickPath), "utf8"))
    + "\n## Quality Gate Commands\n### Tier 1 increment\n```sh\nnpm run lint\n```\n");
  delete config["pre-push"]!.commands["arc-pre-push"]!.use_stdin;
  await writeFile(path, yaml.dump(config));

  const update = await runArc(["update", "--quiet"], root);
  expect(update.exitCode, update.stdout + update.stderr).toBe(0);
  const declarationPath = join(arcDir, "system/arc-checks.yml");
  const content = await readFile(declarationPath, "utf8").catch(() => null);
  expect(content).not.toBeNull();
  if (content === null) return;
  const reference = editorDocumentReference("check-declaration", ".arc/system/arc-checks.yml");
  expect(reference.status).toBe("found");
  if (reference.status === "found") expect(content.split("\n")[0]).toBe(reference.reference);
  const declaration = CheckDeclarationSchema.parse(yaml.load(content));
  expect(Object.values(declaration.checks).map(check => check.command)).toEqual([
    "npm run lint\n", "npm run build\n", "npm run security\n", "npm test\n",
  ]);
  for (const check of Object.values(declaration.checks)) {
    expect(check.gate).toBeUndefined();
    expect(check.shell).toBe(true);
  }
  const updatedManifest = JSON.parse(await readFile(manifestPath, "utf8")) as Manifest;
  const updatedPristine = JSON.parse(await readFile(pristinePath, "utf8")) as Record<string, string>;
  for (const [source, original] of Object.entries(authored)) {
    expect(await readFile(join(arcDir, source), "utf8")).toBe(original);
    expect(updatedManifest.files[source]).toBeUndefined();
    expect(updatedPristine[source]).toBeUndefined();
  }
  const output = update.stdout + update.stderr;
  for (const source of [...Object.keys(authored), quickPath]) expect(output).toContain(source);
  for (const command of ["npm run lint", "npm run build", "npm run security", "npm test"]) expect(output).toContain(command);
  expect(output).toContain("Inspect the security dashboard.");
  expect(output).toContain(path);
  expect((yaml.load(await readFile(path, "utf8")) as Config)["pre-push"]!.commands["arc-pre-push"]!.use_stdin).toBe(true);
}, 60_000);
