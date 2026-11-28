/**
 * Refuse retired Git-notes writes and seal legacy writes once the repository's store has been imported.
 *
 * An import publishes the project registry ref, and every checkout of a repository shares its refs, so the moment one
 * checkout imports, a build that still writes tracked files, identity refs or Git notes would write state nothing reads
 * any more. Reads stay open. The write's backend and operation determine its guidance.
 */
import { lstat, readFile, realpath } from "node:fs/promises";
import { isAbsolute, join } from "node:path";
import { ArcError } from "../kernel/errors.js";
import { readGitDirectories } from "../git/directories.js";
import type { GitExec } from "../git/exec.js";
import { createExecaGitExec } from "../git/process-executor.js";
import { FAMILY_REGISTRY } from "./registry.js";
import type { StoreRefusal } from "./refusal.js";
import { IN_REPO_STORE_OVERRIDE } from "./selection.js";

/** The refusal a sealed write returns or throws. */
export type StoreImportedRefusal = Extract<StoreRefusal, { code: "store-imported" }>;

const CONDITION = "This build of ARC predates the storage cutover, and this repository's store has already been "
  + "imported, so the write would be lost.";
const REMEDY = "Merge the base branch into this checkout with Git (for example `git merge origin/main`), rebuild ARC, "
  + "then run the command again.";
const NOTES_CONDITION = "Git notes are retired. Personal state lives in the store.";
const NOTES_GUIDANCE = {
  save: "Run `arc save` to save personal state.",
  sync: "Run `arc sync` to pull store state. It also publishes store state to the configured push remote "
    + "and can push local code commits when the branch push policy allows it.",
  "projected-files": "The projection keeps these files. No replacement step is needed.",
  compact: "No notes history remains to compact.",
};
const files = { lstat, readFile: (path: string) => readFile(path, "utf8"), realpath };
let defaultExec: GitExec | undefined;

function registryRef(): string {
  const { ref } = FAMILY_REGISTRY["project-registry"];
  if (ref === null || !("pattern" in ref)) throw new Error("The project registry family names no ref of its own");
  return ref.pattern;
}

/**
 * Whether the repository holding this checkout has imported its store: the project registry ref exists where the
 * ref store keeps its refs, the shared store repository when one is installed and the code repository otherwise.
 * Only a positive lookup seals; an unreadable repository or a failed lookup leaves writes as they were.
 * @param checkoutRoot - Any checkout of the repository.
 * @param exec - Git executor for the ref lookup.
 * @returns Whether writes from this build must refuse.
 */
export async function storeImported(checkoutRoot: string, exec?: GitExec): Promise<boolean> {
  try {
    const { commonDir } = await readGitDirectories(checkoutRoot, files);
    return await registryRefExists(commonDir, exec ?? (defaultExec ??= createExecaGitExec()), { cwd: checkoutRoot });
  } catch {
    return false;
  }
}

/**
 * {@link storeImported} for a writer that holds a Git runner but no checkout path: the runner's own repository decides.
 * @param exec - The writer's Git executor, run where its other commands run.
 * @returns Whether writes from this build must refuse.
 */
export async function storeImportedHere(exec: GitExec): Promise<boolean> {
  try {
    const commonDir = (await exec("git", ["rev-parse", "--path-format=absolute", "--git-common-dir"])).stdout.trim();
    return isAbsolute(commonDir) && await registryRefExists(commonDir, exec);
  } catch {
    return false;
  }
}

async function registryRefExists(commonDir: string, exec: GitExec, options?: { cwd: string }): Promise<boolean> {
  const store = join(commonDir, "arc", "store");
  const gitDir = await lstat(store).then(() => store, () => commonDir);
  await exec("git", [`--git-dir=${gitDir}`, "rev-parse", "--verify", "--quiet", registryRef()], options);
  return true;
}

/** The sealed write's refusal, with its observed condition and remedy. */
export function storeImportedRefusal(): StoreImportedRefusal {
  return { code: "store-imported", class: "recoverable", condition: CONDITION, remedy: { text: REMEDY } };
}

/** A sealed write raised through code that reports failure by throwing; its message is the condition and remedy. */
export class StoreImportedError extends ArcError {
  readonly refusal: StoreImportedRefusal = storeImportedRefusal();

  constructor() {
    super(`${CONDITION} ${REMEDY}`, "store.imported");
    this.name = "StoreImportedError";
  }
}

/**
 * Throw before a Git-notes write on the ref store, or a legacy write once the store has been imported.
 * @param checkoutRoot - The checkout the write targets, or undefined to use the executor's repository.
 * @param exec - Git executor for the ref lookup.
 * @param notesWrite - Guidance for the refused Git-notes operation when the ref store is selected.
 * @returns Nothing when the write may proceed.
 */
export async function refuseWriteIfStoreImported(
  checkoutRoot: string | undefined, exec?: GitExec, notesWrite?: keyof typeof NOTES_GUIDANCE,
): Promise<void> {
  if (notesWrite !== undefined && (process.env[IN_REPO_STORE_OVERRIDE] ?? "") === "") {
    throw new ArcError(`${NOTES_CONDITION} ${NOTES_GUIDANCE[notesWrite]}`, "store.notes-retired");
  }
  const git = exec ?? (defaultExec ??= createExecaGitExec());
  const imported = checkoutRoot === undefined ? await storeImportedHere(git) : await storeImported(checkoutRoot, git);
  if (imported) throw new StoreImportedError();
}
