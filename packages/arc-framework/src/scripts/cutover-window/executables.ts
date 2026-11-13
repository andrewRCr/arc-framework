/** Inspect every ARC executable on the committing shell's supplied search path. */
import type { WindowCheckout } from "./checkouts.js";
import type { WindowFinding } from "./result.js";
import { access, stat, realpath } from "node:fs/promises";
import { constants } from "node:fs";
import { delimiter, resolve } from "node:path";
import { localPathContains } from "../../lib/local-path-identity.js";

/** Refuse PATH executables whose resolved targets belong to no permitted checkout. */
export async function readWindowExecutableFindings(checkouts: readonly Pick<WindowCheckout, "path">[],
  path = process.env.PATH ?? "", runningCheckout = resolve(import.meta.dirname, "../../../../..")): Promise<WindowFinding[]> {
  const findings: WindowFinding[] = [], roots = [...checkouts.map(checkout => checkout.path), runningCheckout];
  for (const directory of path.split(delimiter)) {
    for (const name of executableNames()) findings.push(...await executableFindings(resolve(directory, name), roots));
  }
  return findings;
}

/** Drop every search-path directory holding an ARC executable, keeping the rest in order. */
export async function withoutWindowArcDirectories(path: string): Promise<string> {
  const kept: string[] = [];
  for (const directory of path.split(delimiter)) {
    let holdsArc = false;
    for (const name of executableNames()) holdsArc ||= await resolveExecutable(resolve(directory, name)) !== null;
    if (!holdsArc) kept.push(directory);
  }
  return kept.join(delimiter);
}

function executableNames(): string[] {
  if (process.platform !== "win32") return ["arc"];
  const extensions = (process.env.PATHEXT ?? ".COM;.EXE;.BAT;.CMD").split(";").filter(Boolean);
  return [...new Set(["arc", "arc.ps1", ...extensions.map(extension => `arc${extension.toLowerCase()}`)])];
}

async function executableFindings(path: string, roots: readonly string[]): Promise<WindowFinding[]> {
  try {
    const target = await resolveExecutable(path);
    if (target === null) return [];
    if ((await Promise.all(roots.map(root => localPathContains(root, target)))).some(Boolean)) return [];
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
