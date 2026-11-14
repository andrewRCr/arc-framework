/** Construct isolated repository copies with rewritten native worktree registrations. */
import type { WindowRequest } from "./main.js";
import { WindowRefusal } from "./result.js";
import { cp, lstat, mkdir, readdir, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { parseArgs } from "node:util";
import { createDefaultStorePorts } from "../../lib/store/default-ports.js";
import { scanRegisteredWorktrees } from "../../lib/git/worktree-roster.js";
import { readGitDirectories, type GitDirectoryFileAccess } from "../../lib/git/directories.js";
import { windowPathContains } from "./paths.js";
import { canonicalLocalPath } from "../../lib/local-path-identity.js";
import type { GitExec } from "../../lib/git/exec.js";
import { assertWindowCopySafety, type WindowCopySafetyOptions } from "./copy-safety.js";
import type { WindowFinding, WindowResult } from "./result.js";

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

/** A point inside the copy where a caller may act, as a concurrent session would. */
export interface WindowCopyHooks { afterCheckouts?: () => Promise<void> }

/** Construct the requested copy without running an ARC command in it. */
export async function prepareWindowCopy(request: WindowRequest, hooks: WindowCopyHooks = {}): Promise<WindowCopyLayout> {
  const { values } = parseArgs({ args: [...request.args], options: {
    repo: { type: "string" }, json: { type: "boolean" }, destination: { type: "string" },
  } });
  if (!values.destination) refuse("copy", "An explicit --destination is required.");
  const ports = createDefaultStorePorts({ checkoutRoot: request.repo });
  const exec: GitExec = (command, args, options) => ports.exec(command, args, { cwd: request.repo, ...options });
  const roster = await scanRegisteredWorktrees(exec);
  if (!roster.ok) refuse("worktree registrations", roster.message);
  const destination = await futurePhysicalPath(resolve(values.destination));
  const findings: WindowFinding[] = [];
  for (const row of roster.worktrees) {
    if (await windowPathContains(row.path, destination)) findings.push(finding(destination, `The destination is inside live checkout ${row.path}.`));
    if (!row.folderPresent) findings.push(finding(row.path, "A registered checkout has no folder; restore it or prune its registration before copying."));
  }
  if (findings.length > 0) throw new WindowRefusal(findings);
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
  try {
    await fillWindowCopy(layout, { commonDir, origin, exec, fs }, hooks);
  } catch (error) {
    await rm(join(layout.repo, ".git", "worktrees"), { recursive: true, force: true });
    throw partialCopyRefusal(destination, error);
  }
  return layout;
}

interface WindowCopySource { commonDir: string; origin: string; exec: GitExec; fs: GitDirectoryFileAccess }

async function fillWindowCopy(layout: WindowCopyLayout, source: WindowCopySource, hooks: WindowCopyHooks): Promise<void> {
  const { commonDir, origin, exec, fs } = source, destination = layout.destination;
  for (const row of layout.worktrees) {
    await cp(row.source, row.path, { recursive: true, verbatimSymlinks: true,
      filter: path => path !== join(row.source, ".git") &&
        !layout.worktrees.some(other => other.source !== row.source && path === other.source) });
  }
  await hooks.afterCheckouts?.();
  const copiedCommon = join(layout.repo, ".git"), nested = await checkoutsInside(commonDir, layout.worktrees);
  await cp(commonDir, copiedCommon, { recursive: true, verbatimSymlinks: true, filter: path => !nested.includes(path) });
  for (const row of layout.worktrees.filter(row => !row.primary)) {
    const { gitDir } = await readGitDirectories(row.source, fs);
    if (!await windowPathContains(commonDir, gitDir)) refuse(row.source, "The linked checkout metadata is outside the common Git directory.");
    const copiedGit = join(copiedCommon, relative(commonDir, gitDir));
    await writeFile(join(row.path, ".git"), `gitdir: ${copiedGit}\n`);
    await writeFile(join(copiedGit, "gitdir"), `${join(row.path, ".git")}\n`);
    await writeFile(join(copiedGit, "commondir"), `${relative(copiedGit, copiedCommon)}\n`);
  }
  await refuseLateRegistrations(copiedCommon, commonDir, destination);
  await exec("git", ["clone", "--mirror", "--no-hardlinks", "--", origin, layout.mirror]);
  await rewriteRemotes(exec, layout.repo, layout.mirror);
  await rewriteRemotes(exec, layout.mirror, layout.mirror);
  await exec("git", ["worktree", "repair", ...layout.worktrees.filter(row => !row.primary).map(row => row.path)], { cwd: layout.repo });
}

/** Each registered checkout inside the common Git directory, spelled as the common directory's copy visits it. */
async function checkoutsInside(commonDir: string, rows: WindowCopyLayout["worktrees"]): Promise<string[]> {
  const common = await canonicalLocalPath(commonDir), nested: string[] = [];
  for (const row of rows) {
    const rel = relative(common, await canonicalLocalPath(row.source));
    if (rel !== "" && rel !== ".." && !rel.startsWith(`..${sep}`) && !isAbsolute(rel)) nested.push(join(commonDir, rel));
  }
  return nested;
}

/** A failure after the destination is acquired leaves a partial copy whose worktree registrations were removed. */
function partialCopyRefusal(destination: string, error: unknown): WindowRefusal {
  const cleanup = `Remove the partial copy at ${destination}, which holds no worktree registrations, then`;
  const findings = error instanceof WindowRefusal ? error.findings
    : [{ subject: destination, condition: `The copy failed: ${error instanceof Error ? error.message : String(error)}`, remedy: RETRY }];
  return new WindowRefusal(findings.map(finding => ({ ...finding,
    remedy: `${cleanup} ${finding.remedy.charAt(0).toLowerCase()}${finding.remedy.slice(1)}` })));
}

/** Every registration the copy holds must name a copied checkout, or a repair would rewrite a live checkout's pointer. */
async function refuseLateRegistrations(copiedCommon: string, commonDir: string, destination: string): Promise<void> {
  const registrations = join(copiedCommon, "worktrees");
  let entries: string[] = [];
  try { entries = await readdir(registrations); }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
  const findings: WindowFinding[] = [];
  for (const entry of entries.sort()) {
    const admin = join(registrations, entry);
    let checkout: string;
    try { checkout = dirname(resolve(admin, (await readFile(join(admin, "gitdir"), "utf8")).trim())); }
    catch {
      findings.push(finding(join(commonDir, "worktrees", entry), "This worktree registration has no readable gitdir, so Git lists it as prunable and omits it from the registered checkouts.",
        "Run `git worktree prune` in the live repository and retry with a new, absent destination."));
      continue;
    }
    if (!await windowPathContains(destination, checkout)) {
      findings.push(finding(checkout, "This checkout was registered while the copy ran, so the copy holds its registration without its folder; repairing the copy would rewrite the live checkout's pointer."));
    }
  }
  if (findings.length > 0) throw new WindowRefusal(findings);
}

const RETRY = "Repair the condition and retry with a new, absent destination.";

function finding(subject: string, condition: string, remedy = RETRY): WindowFinding {
  return { subject, condition, remedy };
}

function refuse(subject: string, condition: string, remedy = RETRY): never {
  throw new WindowRefusal([finding(subject, condition, remedy)]);
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
