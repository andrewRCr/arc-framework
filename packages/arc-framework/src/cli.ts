/**
 * ARC Framework CLI entry point.
 *
 * Registers commands (init, update, status, diff) and wires each to its
 * orchestrator. Real I/O dependencies are constructed here and injected
 * into testable command modules.
 */

import { Command } from "commander";
import * as p from "@clack/prompts";
import { readFile, writeFile, mkdir, access } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

import { runInit, buildPostInitMessage } from "./commands/init.js";
import type { IOContext } from "./commands/init.js";
import { runInitPrompts } from "./prompts/init-prompts.js";
import { resolveIdentity } from "./lib/identity.js";
import { getArcTemplatePath } from "./lib/paths.js";
import type { GitExec } from "./lib/git.js";
import type { Recipe } from "./lib/types.js";

// --- Real I/O Adapters ---

const execFileAsync = promisify(execFile);

/** Real git executor wrapping child_process.execFile. */
const gitExec: GitExec = async (cmd, args) => {
  const { stdout, stderr } = await execFileAsync(cmd, args);
  return { stdout: stdout.trimEnd(), stderr };
};

/** Real IOContext using node:fs/promises. */
function createIOContext(): IOContext {
  return {
    readFile: (path) => readFile(path, "utf-8"),
    writeFile: (path, content) => writeFile(path, content, "utf-8"),
    mkdir: (path, opts) => mkdir(path, opts).then(() => undefined),
    access: (path) => access(path),
    exec: gitExec,
  };
}

// --- CLI Program ---

const program = new Command();

program
  .name("arc")
  .description("CLI for installing, updating, and managing ARC framework files")
  .version("0.0.0");

program
  .command("init")
  .description("Initialize ARC framework in the current project")
  .action(async () => {
    p.intro("arc init");

    // Interactive prompts
    const prompts = await runInitPrompts(process.cwd());
    if (!prompts) {
      return; // User cancelled — runInitPrompts handles exit
    }

    // Identity resolution (with clack prompt adapter)
    const identityResult = await resolveIdentity({
      exec: gitExec,
      prompt: async (message, defaultValue) => {
        const result = await p.text({
          message,
          defaultValue,
          placeholder: defaultValue,
        });
        return result;
      },
    });

    // Load recipe
    const templateDir = getArcTemplatePath();
    const recipeContent = await readFile(
      new URL("../../init-recipe.json", import.meta.url),
      "utf-8",
    );
    const recipe: Recipe = JSON.parse(recipeContent) as Recipe;

    // Run init with progress feedback
    const spinner = p.spinner();
    spinner.start("Installing ARC framework...");

    const result = await runInit({
      cwd: process.cwd(),
      io: createIOContext(),
      templateDir,
      recipe,
      prompts,
      identityResult,
    });

    if (!result) {
      spinner.stop("Installation cancelled.");
      return;
    }

    spinner.stop("Installation complete.");

    // Post-init message
    p.note(buildPostInitMessage(result), "What's next");

    p.outro("Done.");
  });

program
  .command("update")
  .description("Update ARC framework files to the latest version")
  .action(() => {
    console.log("arc update — not yet implemented");
  });

program
  .command("status")
  .description("Show status of installed ARC framework files")
  .action(() => {
    console.log("arc status — not yet implemented");
  });

program
  .command("diff")
  .description("Show differences between installed and latest framework files")
  .action(() => {
    console.log("arc diff — not yet implemented");
  });

program.parse();
