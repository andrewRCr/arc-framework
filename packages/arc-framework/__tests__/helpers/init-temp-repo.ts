/**
 * A real `arc init` from the package's shipped templates, for tests that need a working installation.
 *
 * Kept apart from the integration helpers so that a suite needing only a temporary repository does not reach the
 * shipped methodology and templates.
 */

import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { runInit } from "../../src/commands/init.js";
import type { Recipe } from "../../src/lib/types.js";
import type { InitPromptResult } from "../../src/prompts/init-prompts.js";
import { getArcTemplatePath, getInternalTemplatePath } from "../../src/lib/paths.js";
import { createTempRepo, makeIOContext } from "./integration.js";

/** Load the real init recipe from the template directory. */
export async function loadRecipe(): Promise<Recipe> {
  const templateDir = getArcTemplatePath();
  const content = await readFile(
    join(templateDir, "..", "init-recipe.json"),
    "utf-8",
  );
  return JSON.parse(content) as Recipe;
}

/**
 * Run a full `arc init` in a temp repo with the given prompt values.
 *
 * Returns the temp directory path. Caller is responsible for cleanup.
 */
export async function initInTempRepo(
  prompts: InitPromptResult,
  identity = "test-user",
): Promise<string> {
  const dir = await createTempRepo();
  const templateDir = getArcTemplatePath();
  const recipe = await loadRecipe();
  const io = makeIOContext(dir);

  await runInit({
    cwd: dir,
    io,
    templateDir,
    internalTemplateDir: getInternalTemplatePath(),
    recipe,
    prompts,
    identityResult: identity,
  });

  return dir;
}

export { getArcTemplatePath, getInternalTemplatePath };
