/** Exact whole-file reads from the working tree or one immutable Git tree. */
import { join } from "node:path";
import type { StoreDirectoryEntry } from "../ports.js";
import type { InRepoContext } from "./context.js";
import { isMissing } from "./refusals.js";

/** Read a regular record, preserving absence separately from failed I/O.
 * @param context - Backend dependencies.
 * @param path - Repository-relative record path.
 * @param revision - Immutable or live tree-ish; absent means the working tree.
 * @returns Exact UTF-8 content, or null for an absent or nonregular entry.
 */
export async function readFileAt(context: InRepoContext, path: string, revision?: string): Promise<string | null> {
  const { ports } = context;
  if (revision !== undefined) {
    const options = { cwd: ports.checkoutRoot, objectAccess: "local-only" as const };
    const tree = await ports.exec("git", ["ls-tree", "-z", revision, "--", `:(literal)${path}`], options);
    if (tree.stdout === "") return null;
    if (!/^100(?:644|755) blob [0-9a-f]+\t/u.test(tree.stdout)) return null;
    return ports.execInput(["show", `${revision}:${path}`], "", options);
  }
  try {
    if (!(await ports.fs.lstat(join(ports.checkoutRoot, path))).isFile()) return null;
    return await ports.fs.readFile(join(ports.checkoutRoot, path));
  } catch (error) { if (isMissing(error)) return null; throw error; }
}
/** Enumerate one directory from the chosen record tree.
 * @param context - Backend dependencies.
 * @param path - Repository-relative directory.
 * @param revision - Tree-ish, or the current working tree.
 * @returns File-type-bearing entries, preserving symbolic links as nonregular.
 */
export async function directoryAt(context: InRepoContext, path: string, revision?: string): Promise<StoreDirectoryEntry[]> {
  if (revision === undefined) return context.ports.fs.readdir(join(context.ports.checkoutRoot, path));
  const { stdout } = await context.ports.exec("git", ["ls-tree", "-z", `${revision}:${path}`], {
    cwd: context.ports.checkoutRoot, objectAccess: "local-only",
  });
  return stdout.split("\0").filter(Boolean).map((entry) => {
    const match = /^([0-7]{6}) (blob|tree|commit) [0-9a-f]+\t(.+)$/u.exec(entry);
    if (match?.[3] === undefined) throw new Error("Git returned an invalid record tree entry");
    return { name: match[3], isDirectory: () => match[2] === "tree",
      isFile: () => match[2] === "blob" && (match[1] === "100644" || match[1] === "100755") };
  });
}
