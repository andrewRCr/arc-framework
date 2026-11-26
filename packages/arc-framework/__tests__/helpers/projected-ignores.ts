/** The ignore lines and personal npm policy an initialized checkout holds, for a fixture that installs ARC by hand. */
import { appendFile, mkdir, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
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
    const { stdout } = await gitExec("git", ["rev-parse", "--git-path", "info/exclude"], { cwd });
    const exclude = resolve(cwd, stdout);
    await mkdir(dirname(exclude), { recursive: true });
    const lines = roots.filter(root => root.file === "info/exclude").map(root => `${root.line}\n`).join("");
    // The leading newline separates an unterminated rule. The final rules take precedence over template negations.
    await appendFile(exclude, `\n${lines}`);
  }
  await mkdir(join(cwd, ".arc/user"), { recursive: true });
  await writeFile(join(cwd, PERSONAL_NPM_IGNORE), PERSONAL_NPM_IGNORE_CONTENT);
}
