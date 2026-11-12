/** Disposable index views for checks that explicitly read indexed content. */
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import type { GitExec } from "../git/exec.js";
import { resolveCheckoutGitDir } from "../git/exec.js";
import type { CheckRequest } from "./request.js";
import type { ResolvedCheckRequest } from "./resolve-request.js";
import { checkRecordDirectory } from "./record.js";

/** One private index and its complete cleanup boundary. */
export interface CheckIndexView { file: string; remove(): Promise<void> }

/** One private scratch directory and its best-effort cleanup boundary. */
export interface CheckIndexDirectory { directory: string; remove(): Promise<void> }

/**
 * Allocate index scratch space without making disposable record storage mandatory.
 * @param git - Git process boundary
 * @param root - Repository root
 * @returns Private record-local storage, or system temporary storage when unavailable
 */
export async function createCheckIndexDirectory(git: GitExec, root: string): Promise<CheckIndexDirectory> {
  let directory: string;
  try {
    const records = await checkRecordDirectory(git, root);
    await mkdir(records, { recursive: true });
    directory = await mkdtemp(join(records, "index-"));
  } catch {
    directory = await mkdtemp(join(tmpdir(), "arc-check-index-"));
  }
  return { directory, remove: async () => {
    try { await rm(directory, { recursive: true, force: true }); }
    catch { /* Disposable scratch cleanup cannot refuse an executed check. */ }
  } };
}

/**
 * Build a private index equal to a checked tree without changing the worktree.
 * @param git - Git process boundary
 * @param root - Repository root
 * @param tree - Checked tree object identity
 * @returns An absolute index path and cleanup operation
 */
export async function createCheckIndexView(git: GitExec, root: string, tree: string): Promise<CheckIndexView> {
  const scratch = await createCheckIndexDirectory(git, root);
  const file = join(scratch.directory, "index");
  const remove = () => scratch.remove();
  try {
    await git("git", ["read-tree", tree], { cwd: root, indexFile: file });
    return { file, remove };
  } catch (error) {
    await remove();
    throw error;
  }
}

/** Lazily shared views belonging to one request. */
export interface CheckIndexViews { get(): Promise<string>; remove(): Promise<void> }

/**
 * Share the retained snapshot or a private tree index among declared index readers.
 * @param git - Git process boundary
 * @param root - Repository root
 * @param request - Event and exact hook index
 * @param coordinates - Current checked content, updated between fixer turns
 * @returns Lazy view resolution and cleanup for the whole request
 */
export function createCheckIndexViews(git: GitExec, root: string, request: CheckRequest, coordinates: ResolvedCheckRequest): CheckIndexViews {
  const views: CheckIndexView[] = [];
  let pending: Promise<CheckIndexView> | undefined;
  let viewedTree: string | undefined;
  return {
    get: async () => {
      if (request.form.kind === "pre-commit") return request.indexFile ?? join(await resolveCheckoutGitDir(git, root), "index");
      if (coordinates.snapshot?.tree === coordinates.tree) return coordinates.snapshot.indexFile;
      if (viewedTree !== coordinates.tree) {
        viewedTree = coordinates.tree;
        pending = createCheckIndexView(git, root, coordinates.tree).then(view => { views.push(view); return view; });
      }
      if (pending === undefined) throw new Error("Could not build a check index view; retry the request.");
      return (await pending).file;
    },
    remove: async () => { await Promise.all(views.map(view => view.remove())); },
  };
}
