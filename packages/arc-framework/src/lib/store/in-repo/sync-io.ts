/** Bind the existing notes serializer to the store's filesystem and Git ports. */
import { join } from "node:path";
import { IDENTITY_STATUS_FILENAME } from "../../user-surfaces.js";
import type { Slug } from "../../kernel/schema/slug.js";
import { personalSurfaces } from "./personal-paths.js";
import type { UserIOContext } from "../../../commands/user/types.js";
import type { DirEntry } from "../../git/user-sync.js";
import { isGitProcessError } from "../../git/process-error.js";
import type { GitExecInput } from "../../git/exec.js";
import type { InRepoContext } from "./context.js";
import { isMissing } from "./refusals.js";

/** Construct notes I/O without reading a file or invoking Git.
 * @param context - Explicit store dependencies.
 * @param identity - Configured owner of the notes namespace.
 * @returns The existing notes command's complete I/O boundary.
 */
export function notesIO(context: InRepoContext, identity: Slug): UserIOContext & { execInput: GitExecInput } {
  const { fs, exec, execInput, checkoutRoot } = context.ports;
  let identityRoot: Promise<string> | undefined;
  return {
    readFile: (path) => fs.readFile(path), writeFile: (path, content) => fs.writeFile(path, content),
    mkdir: async (path, options) => { await fs.mkdir(path, { recursive: options.recursive }); },
    exec: (command, args, options) => exec(command, args, { cwd: checkoutRoot, ...options }),
    execInput: (args, content, options) => execInput(args, content, { cwd: checkoutRoot, ...options }),
    readDir: async (path) => notesDirectory(context, path, await (identityRoot
      ??= personalSurfaces(context, identity).then((surfaces) => surfaces.identityGlobalRoot))),
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
async function notesDirectory(context: InRepoContext, root: string, identityRoot: string): Promise<DirEntry[]> {
  const result: DirEntry[] = [];
  const walk = async (directory: string, prefix: string): Promise<void> => {
    let entries;
    try { entries = await context.ports.fs.readdir(directory); }
    catch (error) { if (isMissing(error)) return; throw error; }
    for (const entry of entries) {
      if (entry.name.startsWith(".") || (directory === identityRoot && entry.name === IDENTITY_STATUS_FILENAME)) continue;
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
