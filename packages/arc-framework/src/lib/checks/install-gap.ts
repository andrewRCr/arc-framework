/** Recognizes a check that failed because a package its npm lockfile declares is not installed. */
import { access, readFile } from "node:fs/promises";
import { dirname, isAbsolute, join, relative, sep } from "node:path";

/**
 * Node's ESM loader names the package and the file importing it; its CommonJS loader names the full specifier and
 * lists the importing file first in its require stack; type checkers name the specifier alone.
 */
const MISSING = /Cannot find (?:package|module) '([^']+)'(?: imported from ([^\r\n]+)|\r?\n[ \t]*Require stack:\r?\n[ \t]*- ([^\r\n]+))?/gu;

/** A package an import could not resolve, and the directory resolution starts from when the message names it. */
interface MissingImport { name: string; from?: string }

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

function missingImports(output: string): MissingImport[] {
  const imports = new Map<string, MissingImport>();
  for (const [, specifier = "", esmImporter, requireImporter] of output.matchAll(MISSING)) {
    const name = packageName(specifier);
    if (name === undefined) continue;
    const path = (esmImporter ?? requireImporter)?.trim();
    const from = path !== undefined && isAbsolute(path) ? dirname(path) : undefined;
    imports.set(`${name}\0${from ?? ""}`, from === undefined ? { name } : { name, from });
  }
  return [...imports.values()];
}

/** npm 6's lockfile nests each package under its dependent's `dependencies`; key them by install path as later versions do. */
function legacyPackages(dependencies: Record<string, unknown>, parent = ""): Record<string, unknown> {
  const packages: Record<string, unknown> = {};
  for (const [name, entry] of Object.entries(dependencies)) {
    const location = `${parent}node_modules/${name}`;
    packages[location] = entry;
    if (isRecord(entry) && isRecord(entry.dependencies)) Object.assign(packages, legacyPackages(entry.dependencies, `${location}/`));
  }
  return packages;
}

async function readLockedPackages(directory: string): Promise<Record<string, unknown> | undefined> {
  try {
    const lockfile: unknown = JSON.parse(await readFile(join(directory, "package-lock.json"), "utf8"));
    if (!isRecord(lockfile)) return undefined;
    if (isRecord(lockfile.packages)) return lockfile.packages;
    return isRecord(lockfile.dependencies) ? legacyPackages(lockfile.dependencies) : undefined;
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

/**
 * The lockfile's install locations for a package that Node's resolver searches from a directory: its own
 * `node_modules` and each ancestor's up to the lockfile's, leaving out optional entries npm may rightly skip.
 */
function reachableLocations(name: string, lockDirectory: string, from: string, packages: Record<string, unknown>): string[] {
  const path = relative(lockDirectory, from);
  if (path === ".." || path.startsWith(`..${sep}`) || isAbsolute(path)) return [];
  const segments = path === "" ? [] : path.split(sep);
  const locations: string[] = [];
  for (let depth = segments.length; depth >= 0; depth--) {
    const location = [...segments.slice(0, depth), "node_modules", name].join("/");
    const entry = packages[location];
    if (entry !== undefined && !(isRecord(entry) && entry.optional === true)) locations.push(location);
  }
  return locations;
}

async function uninstalledPackages(imports: readonly MissingImport[], checkDirectory: string, lockDirectory: string,
  packages: Record<string, unknown>): Promise<string[]> {
  const missing = new Set<string>();
  for (const { name, from = checkDirectory } of imports) {
    if (missing.has(name)) continue;
    const locations = reachableLocations(name, lockDirectory, from, packages);
    if (locations.length === 0) continue;
    const installed = await Promise.all(locations.map(location => exists(join(lockDirectory, location))));
    if (!installed.includes(true)) missing.add(name);
  }
  return [...missing];
}

/**
 * Name the packages a check's output could not resolve that the npm lockfile declares within the importer's reach, yet
 * none of those install locations holds. Resolution starts from the importing file's directory where a loader message
 * names it, and from the check's own directory otherwise. A package the lockfile does not declare there is a
 * defect in the checked code rather than an install gap, so it is left out, as is every package when no directory
 * has a `package-lock.json`.
 * @param output - The check's combined output
 * @param directories - The check's own directory, then further directories to read `package-lock.json` from in order;
 * the first that has one is used
 * @returns Declared packages missing from every install location the importer can resolve
 */
export async function findUninstalledLockedPackages(output: string, directories: readonly string[]): Promise<string[]> {
  const imports = missingImports(output);
  const [checkDirectory] = directories;
  if (imports.length === 0 || checkDirectory === undefined) return [];
  for (const directory of directories) {
    const packages = await readLockedPackages(directory);
    if (packages !== undefined) return uninstalledPackages(imports, checkDirectory, directory, packages);
  }
  return [];
}

/** State an install gap as a check's couldn't-run reason, naming the repair. */
export function installGapReason(names: readonly string[]): string {
  return `${names.join(", ")} ${names.length === 1 ? "is" : "are"} in package-lock.json but not installed; run npm ci, then retry`;
}
