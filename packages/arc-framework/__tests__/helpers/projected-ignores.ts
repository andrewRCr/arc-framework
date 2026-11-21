/** The ignore lines and personal npm policy an initialized checkout holds, for a fixture that installs ARC by hand. */
import { appendFile, mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { SlugSchema } from "../../src/lib/kernel/index.js";
import { PERSONAL_NPM_IGNORE, PERSONAL_NPM_IGNORE_CONTENT } from "../../src/lib/personal-npm-ignore.js";
import { guardedProjectionRoots, type IgnoreLineFile } from "../../src/lib/store/projection/ignore-guard.js";

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
  await appendFile(join(cwd, ".gitignore"), projectedRootLines(identity, ".gitignore"));
  if (options.tracksState !== true) {
    await appendFile(join(cwd, ".git/info/exclude"), projectedRootLines(identity, "info/exclude"));
  }
  await mkdir(join(cwd, ".arc/user"), { recursive: true });
  await writeFile(join(cwd, PERSONAL_NPM_IGNORE), PERSONAL_NPM_IGNORE_CONTENT);
}

function projectedRootLines(identity: string, file: IgnoreLineFile): string {
  return guardedProjectionRoots(SlugSchema.parse(identity)).filter(root => root.file === file)
    .map(root => `${root.line}\n`).join("");
}
