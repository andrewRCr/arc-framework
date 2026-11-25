/** The ignore lines and personal npm policy an initialized checkout holds, for a fixture that installs ARC by hand. */
import { appendFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { ensureGitExcludePatterns } from "../../src/lib/git/exclude.js";
import { gitExec } from "../../src/lib/io-context.js";
import { SlugSchema } from "../../src/lib/kernel/index.js";
import { PERSONAL_NPM_IGNORE, PERSONAL_NPM_IGNORE_CONTENT } from "../../src/lib/personal-npm-ignore.js";
import { guardedProjectionRoots } from "../../src/lib/store/projection/ignore-guard.js";

/** A checkout that tracks ARC state, as one on the in-repo store does, leaves its lifecycle roots unexcluded. */
export interface ProjectedIgnoreOptions { readonly tracksState?: boolean }

/**
 * Write what the projection's ignore guard requires, as `arc init` writes it, so the guard passes over a fixture that
 * installs ARC by hand: the `.gitignore` lines, Git's exclude lines unless the checkout tracks ARC state, and the
 * personal npm policy.
 * @param cwd - The fixture's main checkout.
 * @param identity - The ARC identity whose roots the guard checks.
 * @param options - Whether the checkout tracks ARC state.
 */
export async function writeProjectedIgnores(cwd: string, identity: string, options: ProjectedIgnoreOptions = {}):
  Promise<void> {
  const roots = guardedProjectionRoots(SlugSchema.parse(identity));
  await appendFile(join(cwd, ".gitignore"), roots.filter(root => root.file === ".gitignore")
    .map(root => `${root.line}\n`).join(""));
  if (options.tracksState !== true) {
    const patterns = roots.filter(root => root.file === "info/exclude").map(root => root.line);
    const excluded = await ensureGitExcludePatterns(cwd, patterns, gitExec, {
      readFile: path => readFile(path, "utf8"),
      writeFile,
      mkdir: async (path, options) => { await mkdir(path, options); },
      // The caller owns this temporary repository exclusively during setup.
      withLock: (_path, operation) => operation(),
    });
    if (!excluded.ok) throw excluded.error;
  }
  await mkdir(join(cwd, ".arc/user"), { recursive: true });
  await writeFile(join(cwd, PERSONAL_NPM_IGNORE), PERSONAL_NPM_IGNORE_CONTENT);
}
