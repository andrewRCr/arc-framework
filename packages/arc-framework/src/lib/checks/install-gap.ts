/** Recognizes a check that failed because a package its npm lockfile declares is not installed. */
import { access, readFile } from "node:fs/promises";
import { join } from "node:path";

/** Node's ESM loader names the package; its CommonJS loader and type checkers name the full specifier. */
const MISSING_PACKAGE = /Cannot find package '([^']+)'/gu;
const MISSING_MODULE = /Cannot find module '([^']+)'/gu;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** The package a bare specifier imports from, or nothing for a relative, absolute, or built-in specifier. */
function packageName(specifier: string): string | undefined {
  if (/^(?:\.|\/|[A-Za-z]:[\\/]|node:|file:)/u.test(specifier)) return undefined;
  const [first, second] = specifier.split("/");
  if (first === undefined || first === "") return undefined;
  if (!first.startsWith("@")) return first;
  return second === undefined || second === "" ? undefined : `${first}/${second}`;
}

function missingPackageNames(output: string): string[] {
  const specifiers = [...output.matchAll(MISSING_PACKAGE), ...output.matchAll(MISSING_MODULE)].map(match => match[1] ?? "");
  return [...new Set(specifiers.map(packageName).filter((name): name is string => name !== undefined))];
}

async function readLockedPackages(directory: string): Promise<Record<string, unknown> | undefined> {
  try {
    const lockfile: unknown = JSON.parse(await readFile(join(directory, "package-lock.json"), "utf8"));
    return isRecord(lockfile) && isRecord(lockfile.packages) ? lockfile.packages : undefined;
  } catch {
    return undefined;
  }
}

async function exists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

/** Install locations the lockfile records for a package, leaving out optional ones npm may rightly skip. */
function lockedLocations(name: string, packages: Record<string, unknown>): string[] {
  return Object.entries(packages)
    .filter(([key, entry]) => (key === `node_modules/${name}` || key.endsWith(`/node_modules/${name}`))
      && !(isRecord(entry) && entry.optional === true))
    .map(([key]) => key);
}

/**
 * Name the packages a check's output could not resolve that the npm lockfile declares and no install location holds.
 * A package the lockfile does not declare is a defect in the checked code rather than an install gap, so it is left
 * out, as is every package when no directory has a `package-lock.json`.
 * @param output - The check's combined output
 * @param directories - Directories to read `package-lock.json` from, in order; the first that has one is used
 * @returns Declared packages missing from every install location the lockfile records for them
 */
export async function findUninstalledLockedPackages(output: string, directories: readonly string[]): Promise<string[]> {
  const names = missingPackageNames(output);
  if (names.length === 0) return [];
  for (const directory of directories) {
    const packages = await readLockedPackages(directory);
    if (packages === undefined) continue;
    const missing: string[] = [];
    for (const name of names) {
      const locations = lockedLocations(name, packages);
      if (locations.length === 0) continue;
      const installed = await Promise.all(locations.map(location => exists(join(directory, location))));
      if (!installed.includes(true)) missing.push(name);
    }
    return missing;
  }
  return [];
}

/** State an install gap as a check's couldn't-run reason, naming the repair. */
export function installGapReason(names: readonly string[]): string {
  return `${names.join(", ")} ${names.length === 1 ? "is" : "are"} in package-lock.json but not installed; run npm ci, then retry`;
}
