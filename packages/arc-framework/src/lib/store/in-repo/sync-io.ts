/** Bind the existing notes serializer to the store's filesystem and Git ports. */
import { join } from "node:path";
import type { UserIOContext } from "../../../commands/user/types.js";
import type { DirEntry } from "../../git/user-sync.js";
import { isGitProcessError } from "../../git/process-error.js";
import type { InRepoContext } from "./context.js";
import { isMissing } from "./refusals.js";

/** Construct notes I/O without reading a file or invoking Git.
 * @param context - Explicit store dependencies.
 * @returns The existing notes command's complete I/O boundary.
 */
export function notesIO(context: InRepoContext): UserIOContext {
  const { fs, exec, execInput, checkoutRoot } = context.ports;
  return {
    readFile: (path) => fs.readFile(path), writeFile: (path, content) => fs.writeFile(path, content),
    mkdir: async (path, options) => { await fs.mkdir(path, { recursive: options.recursive }); },
    exec: (command, args, options) => exec(command, args, { cwd: checkoutRoot, ...options }),
    execInput: (args, content, options) => execInput(args, content, { cwd: checkoutRoot, ...options }),
    readDir: (path) => notesDirectory(context, path),
    writeNote: async (ref, content, commit) => {
      await execInput(["notes", "--ref", ref, "add", "--force", "-F", "-", commit], content, { cwd: checkoutRoot });
    },
    readNote: async (ref, commit) => {
      try { return await execInput(["notes", "--ref", ref, "show", commit], "", { cwd: checkoutRoot, objectAccess: "local-only" }); }
      catch (error) {
        if (isGitProcessError(error) && error.kind === "nonzero-exit" && error.exitCode === 1) return null;
        throw error;
      }
    },
  };
}
async function notesDirectory(context: InRepoContext, root: string): Promise<DirEntry[]> {
  const result: DirEntry[] = [];
  const walk = async (directory: string, prefix: string): Promise<void> => {
    let entries;
    try { entries = await context.ports.fs.readdir(directory); }
    catch (error) { if (isMissing(error)) return; throw error; }
    for (const entry of entries) {
      if (entry.name.startsWith(".")) continue;
      const path = join(directory, entry.name);
      const name = prefix === "" ? entry.name : `${prefix}/${entry.name}`;
      if (entry.isDirectory()) await walk(path, name);
      else if (entry.isFile()) {
        const stat = await context.ports.fs.lstat(path);
        if (stat.isFile()) result.push({ name, size: stat.size });
      }
    }
  };
  await walk(root, "");
  return result;
}
