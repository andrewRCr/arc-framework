/** All ignore-setup entry points refuse aliases before leaving installation state that prevents a repaired retry. */
import { access, readFile, rmdir, symlink, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, expect, it } from "vitest";
import { createTempRepo, cleanupTempDir, makeIOContext, commitAll, DEFAULT_PROMPTS, readManifestFile } from "../helpers/integration.js";
import { loadRecipe, getArcTemplatePath, getInternalTemplatePath } from "../helpers/init-temp-repo.js";
import { runInit } from "../../src/commands/init.js";
import { runJoin, runJoinReconfigure } from "../../src/commands/join.js";
import { runReconfigure } from "../../src/commands/reconfigure.js";
import { runUpdate } from "../../src/commands/update.js";

const directories: string[] = [];
afterEach(async () => { for (const cwd of directories.splice(0)) await cleanupTempDir(cwd); });
it.each(["init", "join", "join-reconfigure", "reconfigure", "update"])("%s refuses an ignore alias and succeeds after repairing only the alias", async (command) => {
  const cwd = await createTempRepo("arc-ignore-command-");
  directories.push(cwd);
  const io = makeIOContext(cwd);
  const recipe = await loadRecipe();
  const templateDir = getArcTemplatePath();
  const internalTemplateDir = getInternalTemplatePath();
  const initial = { cwd, io, recipe, templateDir, internalTemplateDir,
    prompts: { ...DEFAULT_PROMPTS, tools: [] }, identityResult: null };
  if (command !== "init") await runInit(initial);
  const run = async () => {
    if (command === "init") return runInit(initial);
    if (command === "join") return runJoin({ cwd, io, templateDir, internalTemplateDir,
      prompts: { role: "maintainer", tools: [] }, identityResult: null });
    if (command === "join-reconfigure") return runJoinReconfigure({ cwd, io, templateDir,
      prompts: { role: "maintainer", tools: [] }, previousTools: [], removeIO: { access, unlink, rmdir } });
    if (command === "reconfigure") return runReconfigure({ cwd, io, recipe, templateDir,
      newInstallConfig: (await readManifestFile(cwd)).install_config });
    return runUpdate({ cwd, io, recipe, templateDir });
  };
  const gitignore = join(cwd, ".gitignore"), ignore = join(cwd, ".ignore");
  const original = "# preserve these rules\n";
  await writeFile(gitignore, original);
  await unlink(ignore).catch((error: NodeJS.ErrnoException) => { if (error.code !== "ENOENT") throw error; });
  await symlink(".gitignore", ignore);
  if (command === "update" || command === "reconfigure") await commitAll(cwd);
  await expect(run()).rejects.toMatchObject({ code: "ignore.unsafe-output" });
  expect(await readFile(gitignore, "utf8")).toBe(original);
  expect(await readFile(ignore, "utf8")).toBe(original);
  await unlink(ignore);
  await writeFile(ignore, "# preserve search rules\n");
  if (command === "update" || command === "reconfigure") await commitAll(cwd);
  await run();
  expect(await readFile(gitignore, "utf8")).toContain(".arc/user/*/");
  expect(await readFile(ignore, "utf8")).toContain("!.arc/user/*/");
}, 30_000);
