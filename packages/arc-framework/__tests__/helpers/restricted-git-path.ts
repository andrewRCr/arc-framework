/** Fixture-owned executable search paths that exclude ambient CLI installations. */
import { constants } from "node:fs";
import { access, mkdir, mkdtemp, symlink } from "node:fs/promises";
import { delimiter, join, resolve } from "node:path";

/**
 * Link only the utilities required by native hook fixtures into their owned temporary repository.
 * @param root - Temporary fixture root, whose cleanup owns the generated directory
 * @returns A PATH retaining utility resolution without exposing any ambient arc executable
 */
export async function restrictedGitPath(root: string): Promise<string> {
  const parent = join(root, ".git");
  await mkdir(parent, { recursive: true });
  const bin = await mkdtemp(join(parent, "cli-absence-"));
  const directories = [...new Set([...(process.env.PATH ?? "").split(delimiter)
    .map(raw => raw.replace(/^"(.*)"$/u, "$1")), "/usr/bin", "/bin"])];
  for (const name of ["git", "bash", "sh", "env", "cat", "dirname", "basename", "cut", "grep", "head", "sed", "sort", "comm", "wc", "tr", "node"]) {
    const executable = process.platform === "win32" ? `${name}.exe` : name;
    let source: string | undefined;
    for (const directory of directories) {
      const candidate = resolve(directory, executable);
      try { await access(candidate, constants.X_OK); source = candidate; break; }
      catch { /* Continue to the next executable search directory. */ }
    }
    if (source === undefined) throw new Error(`${name} executable unavailable`);
    await symlink(source, join(bin, executable), "file");
  }
  return bin;
}
