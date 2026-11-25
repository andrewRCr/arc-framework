/** Dependency-free choice of the executable a Git child process starts. */
import { statSync } from "node:fs";
import { win32 } from "node:path";

/**
 * @typedef {object} GitExecutableHost
 * @property {NodeJS.Platform} platform
 * @property {(path: string) => boolean} isFile - True for a regular file, and for one `stat` refuses with `EACCES`.
 * @property {(path: string) => boolean} isDirectory - True for a directory, and for a path `stat` cannot inspect.
 * @property {Record<string, string | undefined>} environment - Read for `PATHEXT`, and for `PATH` when a child
 *   inherits it.
 */

/** @type {GitExecutableHost} */
const PROCESS_HOST = {
  get platform() { return globalThis.process.platform; },
  isFile: (path) => {
    try {
      return statSync(path, { throwIfNoEntry: false })?.isFile() === true;
    } catch (error) {
      // As in execa's lookup: Windows app execution aliases refuse `stat` with `EACCES`, yet they launch.
      return /** @type {NodeJS.ErrnoException} */ (error).code === "EACCES";
    }
  },
  isDirectory: (path) => {
    try {
      return statSync(path, { throwIfNoEntry: false })?.isDirectory() === true;
    } catch {
      return true;
    }
  },
  get environment() { return globalThis.process.env; },
};

const GIT_FOR_WINDOWS_SYSTEMS = ["ucrt64", "mingw64", "clangarm64", "mingw32"];

/** The list execa's lookup (which-command) uses when `PATHEXT` is unset or empty. */
const DEFAULT_PATHEXT = ".COM;.EXE;.BAT;.CMD;.VBS;.VBE;.JS;.JSE;.WSF;.WSH;.MSC";

/** A drive-qualified or UNC Windows path, the only form of a home this module reads. */
const WINDOWS_PATH = /^(?:[A-Za-z]:[\\/]|[\\/]{2}[^\\/])/u;

/** @type {WeakMap<GitExecutableHost, Map<string, string>>} */
const resolutions = new WeakMap();

/**
 * Name the executable that starts Git in a child process with this environment.
 *
 * On Windows, `git` on `PATH` is usually Git for Windows' `cmd\git.exe`, a launcher whose only work is to start
 * `<root>\<system>\bin\git.exe`, which costs a second process start on every call. With `MSYSTEM` unset, that binary
 * sets `MSYSTEM`, `HOME` and `PLINK_PROTOCOL` as the launcher does and puts the same directories on `PATH`, except that
 * it puts `~/bin` ahead of Git's own `bin` directories where the launcher puts it after them. So start the binary
 * itself only when the first `git` on `PATH` is that launcher, `MSYSTEM` is unset, and the `bin` directory under Git's
 * home does not exist: then what Git runs resolves every command as it would under the launcher. With `MSYSTEM` set the
 * binary skips that setup, which the launcher always does. Anything else found first, such as a wrapper, a shim or a
 * script, keeps the bare name, as does any doubt.
 *
 * The lookup follows execa's (which-command): each `PATH` entry in order with each `PATHEXT` extension, its default
 * list when `PATHEXT` is unset or empty, and a file `stat` refuses with `EACCES` counted as found. It leaves out the
 * working directory that lookup searches first. Execa starts an `.exe` or `.com` it finds by the bare name, and Node
 * then tries `git.com` before `git.exe` in each directory whatever `PATHEXT` lists, so a `git.com` keeps the bare name
 * too. The answer is kept for the life of the process.
 *
 * A variable spelled more than one way with different values is doubt: execa's lookup reads its last spelling, while
 * Node passes a child only the first in sorted order, and that is the `PATH` searched for Git started by its bare
 * name.
 * @param {Record<string, string | undefined> | undefined} environment - The child's environment; when omitted, the
 *   child inherits the host's.
 * @param {GitExecutableHost} [host]
 * @returns {string}
 */
export function gitExecutable(environment, host = PROCESS_HOST) {
  if (host.platform !== "win32") return "git";
  const childEnvironment = environment ?? host.environment;
  if (single(childEnvironment, "MSYSTEM") !== undefined) return "git";
  const path = single(childEnvironment, "PATH");
  const listedPathExt = single(host.environment, "PATHEXT");
  const homes = gitHomes(childEnvironment);
  if (path === null || listedPathExt === null || homes === null) return "git";
  const pathExt = listedPathExt || DEFAULT_PATHEXT;
  let known = resolutions.get(host);
  if (known === undefined) {
    known = new Map();
    resolutions.set(host, known);
  }
  const key = [path ?? "", pathExt, ...homes].join("\0");
  let executable = known.get(key);
  if (executable === undefined) {
    executable = homes.some(home => host.isDirectory(win32.join(home, "bin")))
      ? "git"
      : launchedBinary(path ?? "", pathExt.split(";").filter(Boolean), host.isFile);
    known.set(key, executable);
  }
  return executable;
}

/**
 * The distinct values a Windows environment variable holds across its spellings, in any case.
 * @param {Record<string, string | undefined>} environment
 * @param {string} name
 * @returns {(string | undefined)[]}
 */
function spellings(environment, name) {
  const keys = Object.keys(environment).filter(candidate => candidate.toUpperCase() === name);
  return [...new Set(keys.map(key => environment[key]))];
}

/**
 * The one value a Windows environment variable holds across its spellings, or `null` when they disagree.
 * @param {Record<string, string | undefined>} environment
 * @param {string} name
 * @returns {string | undefined | null}
 */
function single(environment, name) {
  const [value, ...others] = spellings(environment, name);
  return others.length > 0 ? null : value;
}

/**
 * The homes whose `bin` the binary may put on `PATH`: `HOME` when set, otherwise both places Git for Windows computes a
 * home from. `null` when one is not a Windows path this module can check.
 * @param {Record<string, string | undefined>} environment
 * @returns {string[] | null}
 */
function gitHomes(environment) {
  const [home, drive, homePath, profile] = ["HOME", "HOMEDRIVE", "HOMEPATH", "USERPROFILE"]
    .map(name => single(environment, name));
  if ([home, drive, homePath, profile].includes(null)) return null;
  const candidates = home !== undefined
    ? [home]
    : [drive !== undefined && homePath !== undefined ? `${drive}${homePath}` : undefined, profile];
  const homes = candidates.flatMap(candidate => typeof candidate === "string" ? [candidate] : []);
  return homes.every(candidate => WINDOWS_PATH.test(candidate)) ? homes : null;
}

/**
 * The binary behind the first `git` on `PATH` when that is Git for Windows' launcher, otherwise the bare name.
 * @param {string} path
 * @param {string[]} extensions
 * @param {(path: string) => boolean} isFile
 * @returns {string}
 */
function launchedBinary(path, extensions, isFile) {
  const listed = extensions.map(extension => extension.toLowerCase());
  const probed = [...new Set([...listed, ".com", ".exe"])];
  for (const entry of path.split(";")) {
    const directory = /^".*"$/u.test(entry) ? entry.slice(1, -1) : entry;
    if (directory === "") continue;
    if (!win32.isAbsolute(directory)) return "git";
    const present = probed.filter(extension => isFile(win32.join(directory, `git${extension}`)));
    if (present.length === 0) continue;
    const launcher = present[0] === ".exe" && listed.includes(".exe") && !present.includes(".com")
      && win32.basename(directory).toLowerCase() === "cmd";
    if (!launcher) return "git";
    const [binary, ...others] = GIT_FOR_WINDOWS_SYSTEMS
      .map(system => win32.join(directory, "..", system, "bin", "git.exe"))
      .filter(isFile);
    return binary !== undefined && others.length === 0 ? binary : "git";
  }
  return "git";
}
