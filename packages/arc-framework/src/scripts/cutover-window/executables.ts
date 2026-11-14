/** Inspect every ARC executable on the committing shell's supplied search path. */
import type { WindowCheckout } from "./checkouts.js";
import { WindowRefusal, type WindowFinding } from "./result.js";
import { access, stat, realpath } from "node:fs/promises";
import { constants } from "node:fs";
import { delimiter, resolve } from "node:path";
import { windowPathContains } from "./paths.js";

/** Refuse PATH executables whose resolved targets belong to no permitted checkout. */
export async function readWindowExecutableFindings(checkouts: readonly Pick<WindowCheckout, "path">[],
  path = process.env.PATH ?? "", runningCheckout = resolve(import.meta.dirname, "../../../../..")): Promise<WindowFinding[]> {
  const findings: WindowFinding[] = [], roots = [...checkouts.map(checkout => checkout.path), runningCheckout];
  for (const directory of path.split(delimiter)) {
    for (const name of executableNames("arc")) findings.push(...await executableFindings(resolve(directory, name), roots));
  }
  return findings;
}

/** The tools the rehearsal starts by name under its filtered search path: the rebuild's npm, and the hooks' node, git and bash. */
const WINDOW_REHEARSAL_TOOLS = ["node", "npm", "git", "bash"] as const;

/**
 * Drop every search-path directory holding an ARC executable, keeping the rest in order. Refuse when a resolution
 * fails, or when dropping a directory takes away or changes a tool the rehearsal starts by name.
 */
export async function withoutWindowArcDirectories(path: string): Promise<string> {
  const directories = path.split(delimiter), kept: string[] = [], findings: WindowFinding[] = [];
  for (const directory of directories) {
    try {
      if (await resolveIn(directory, executableNames("arc")) === null) kept.push(directory);
    } catch (error) {
      findings.push(unresolvableEntry(directory, error));
    }
  }
  if (findings.length === 0) {
    for (const tool of WINDOW_REHEARSAL_TOOLS) findings.push(...await droppedToolFindings(tool, directories, kept));
  }
  if (findings.length > 0) throw new WindowRefusal(findings);
  return kept.join(delimiter);
}

async function droppedToolFindings(tool: string, directories: readonly string[], kept: readonly string[]): Promise<WindowFinding[]> {
  const before = await firstOnPath(executableNames(tool), directories);
  if ("finding" in before) return [before.finding];
  if (before.found === null) return [];
  const after = await firstOnPath(executableNames(tool), kept);
  if ("finding" in after) return [after.finding];
  if (after.found?.target === before.found.target) return [];
  return [{ subject: before.found.directory,
    condition: `This PATH directory holds both arc and ${tool}, so dropping it to hide arc ${after.found === null
      ? `leaves no ${tool}` : `changes ${tool} from ${before.found.target} to ${after.found.target}`} for the rehearsal.`,
    remedy: "Take that arc off PATH for the rehearsal by uninstalling or unlinking it, then retry the rehearsal." }];
}

async function firstOnPath(names: readonly string[], directories: readonly string[]):
  Promise<{ found: { directory: string; target: string } | null } | { finding: WindowFinding }> {
  for (const directory of directories) {
    try {
      const target = await resolveIn(directory, names);
      if (target !== null) return { found: { directory, target } };
    } catch (error) {
      return { finding: unresolvableEntry(directory, error) };
    }
  }
  return { found: null };
}

async function resolveIn(directory: string, names: readonly string[]): Promise<string | null> {
  for (const name of names) {
    const target = await resolveExecutable(resolve(directory, name));
    if (target !== null) return target;
  }
  return null;
}

function unresolvableEntry(directory: string, error: unknown): WindowFinding {
  return { subject: directory, condition: `This PATH entry could not be resolved: ${error instanceof Error ? error.message : String(error)}`,
    remedy: "Repair or remove this PATH entry, then retry the rehearsal." };
}

function executableNames(base: string): string[] {
  if (process.platform !== "win32") return [base];
  const extensions = (process.env.PATHEXT ?? ".COM;.EXE;.BAT;.CMD").split(";").filter(Boolean);
  return [...new Set([base, ...base === "arc" ? ["arc.ps1"] : [], ...extensions.map(extension => `${base}${extension.toLowerCase()}`)])];
}

async function executableFindings(path: string, roots: readonly string[]): Promise<WindowFinding[]> {
  try {
    const target = await resolveExecutable(path);
    if (target === null) return [];
    if ((await Promise.all(roots.map(root => windowPathContains(root, target)))).some(Boolean)) return [];
    return [{ subject: path, condition: `ARC executable resolves outside every permitted checkout: ${target}.`,
      remedy: "Uninstall this executable or take its directory off PATH for the window, then retry check." }];
  } catch (error) {
    return [{ subject: path, condition: `The ARC executable could not be resolved: ${error instanceof Error ? error.message : String(error)}`,
      remedy: "Repair or remove this PATH entry, then retry check." }];
  }
}

async function resolveExecutable(path: string): Promise<string | null> {
  try {
    if (!(await stat(path)).isFile()) return null;
    await access(path, constants.X_OK);
  } catch (error) {
    if (typeof error === "object" && error !== null && "code" in error && ["ENOENT", "ENOTDIR", "EACCES"].includes(String(error.code))) return null;
    throw error;
  }
  return realpath(path);
}
