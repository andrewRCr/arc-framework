/** Construct isolated repository copies with rewritten native worktree registrations. */
import type { WindowRequest } from "./main.js";
import { WindowRefusal } from "./result.js";
import { cp, lstat, mkdir, readFile, realpath, writeFile } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";
import { parseArgs } from "node:util";
import { createDefaultStorePorts } from "../../lib/store/default-ports.js";
import { scanRegisteredWorktrees } from "../../lib/git/worktree-roster.js";
import { readGitDirectories } from "../../lib/git/directories.js";
import { localPathContains } from "../../lib/local-path-identity.js";
import type { GitExec } from "../../lib/git/exec.js";
import { assertWindowCopySafety, type WindowCopySafetyOptions } from "./copy-safety.js";
import type { WindowResult } from "./result.js";

/** Coordinates of one copied repository and its independent local mirror. */
export interface WindowCopyLayout {
  destination: string; repo: string; mirror: string;
  worktrees: { source: string; path: string; primary: boolean }[];
}

/** Acquire a complete repository copy and establish its isolation before exposing it to a rehearsal. */
export async function copyWindow(request: WindowRequest, options: WindowCopySafetyOptions = {}): Promise<WindowResult> {
  const layout = await prepareWindowCopy(request);
  await assertWindowCopySafety(layout, options);
  return { operation: "copy", status: "passed", findings: [], data: layout };
}

/** Construct the requested copy without running an ARC command in it. */
export async function prepareWindowCopy(request: WindowRequest): Promise<WindowCopyLayout> {
  const { values } = parseArgs({ args: [...request.args], options: {
    repo: { type: "string" }, json: { type: "boolean" }, destination: { type: "string" },
  } });
  if (!values.destination) refuse("copy", "An explicit --destination is required.");
  const ports = createDefaultStorePorts({ checkoutRoot: request.repo });
  const exec: GitExec = (command, args, options) => ports.exec(command, args, { cwd: request.repo, ...options });
  const roster = await scanRegisteredWorktrees(exec);
  if (!roster.ok) refuse("worktree registrations", roster.message);
  const destination = await futurePhysicalPath(resolve(values.destination));
  for (const row of roster.worktrees) {
    if (await localPathContains(row.path, destination)) refuse(destination, `The destination is inside live checkout ${row.path}.`);
    if (!row.folderPresent) refuse(row.path, "A registered checkout has no folder; restore it or prune its registration before copying.");
  }
  const primary = roster.worktrees.find(row => row.primary);
  if (!primary) refuse("copy", "No primary checkout is registered.");
  const fs = { lstat, realpath, readFile: (path: string) => readFile(path, "utf8") };
  const { commonDir } = await readGitDirectories(primary.path, fs);
  const layout: WindowCopyLayout = { destination, repo: join(destination, "primary"), mirror: join(destination, "mirror.git"),
    worktrees: roster.worktrees.map((row, index) => ({ source: row.path, primary: row.primary,
      path: row.primary ? join(destination, "primary") : join(destination, "worktrees", String(index)) })) };
  const origin = (await exec("git", ["remote", "get-url", "origin"])).stdout.trim();
  await mkdir(dirname(destination), { recursive: true });
  try { await mkdir(destination); }
  catch (error) { refuse(destination, `Cannot acquire a new copy destination: ${String(error)}`); }
  for (const row of layout.worktrees) {
    await cp(row.source, row.path, { recursive: true, verbatimSymlinks: true,
      filter: path => path !== join(row.source, ".git") &&
        !layout.worktrees.some(other => other.source !== row.source && path === other.source) });
  }
  const copiedCommon = join(layout.repo, ".git");
  await cp(commonDir, copiedCommon, { recursive: true, verbatimSymlinks: true });
  for (const row of layout.worktrees.filter(row => !row.primary)) {
    const { gitDir } = await readGitDirectories(row.source, fs);
    if (!await localPathContains(commonDir, gitDir)) refuse(row.source, "The linked checkout metadata is outside the common Git directory.");
    const copiedGit = join(copiedCommon, relative(commonDir, gitDir));
    await writeFile(join(row.path, ".git"), `gitdir: ${copiedGit}\n`);
    await writeFile(join(copiedGit, "gitdir"), `${join(row.path, ".git")}\n`);
    await writeFile(join(copiedGit, "commondir"), `${relative(copiedGit, copiedCommon)}\n`);
  }
  await exec("git", ["clone", "--mirror", "--no-hardlinks", "--", origin, layout.mirror]);
  await rewriteRemotes(exec, layout.repo, layout.mirror);
  await rewriteRemotes(exec, layout.mirror, layout.mirror);
  await exec("git", ["worktree", "repair", ...layout.worktrees.filter(row => !row.primary).map(row => row.path)], { cwd: layout.repo });
  return layout;
}

function refuse(subject: string, condition: string): never {
  throw new WindowRefusal([{ subject, condition,
    remedy: "Repair the condition and retry with a new, absent destination; retain or remove any partial copy explicitly." }]);
}

async function futurePhysicalPath(path: string): Promise<string> {
  try { return await realpath(path); }
  catch (error) {
    if (!(error instanceof Error && "code" in error && error.code === "ENOENT")) throw error;
    return join(await futurePhysicalPath(dirname(path)), relative(dirname(path), path));
  }
}

async function rewriteRemotes(exec: GitExec, cwd: string, mirror: string): Promise<void> {
  const names = (await exec("git", ["remote"], { cwd })).stdout.trim().split("\n").filter(Boolean);
  for (const name of names) for (const key of ["url", "pushurl"]) {
    await exec("git", ["config", "--local", "--replace-all", `remote.${name}.${key}`, mirror], { cwd });
  }
}
