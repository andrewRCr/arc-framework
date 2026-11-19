/** Dependency-free choice of the executable a Git child process starts. */
import { statSync } from "node:fs";
import { win32 } from "node:path";

/**
 * @typedef {object} GitExecutableHost
 * @property {NodeJS.Platform} platform
 * @property {(path: string) => boolean} isFile - True for a regular file, and for one `stat` refuses with `EACCES`.
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
  get environment() { return globalThis.process.env; },
};

const GIT_FOR_WINDOWS_SYSTEMS = ["ucrt64", "mingw64", "clangarm64", "mingw32"];

/** The list execa's lookup (which-command) uses when `PATHEXT` is unset or empty. */
const DEFAULT_PATHEXT = ".COM;.EXE;.BAT;.CMD;.VBS;.VBE;.JS;.JSE;.WSF;.WSH;.MSC";

/** @type {WeakMap<GitExecutableHost, Map<string, string>>} */
const resolutions = new WeakMap();

/**
 * Name the executable that starts Git in a child process with this environment.
 *
 * On Windows, `git` on `PATH` is usually Git for Windows' `cmd\git.exe`, a launcher whose only work is to start
 * `<root>\<system>\bin\git.exe`, which costs a second process start on every call. When `MSYSTEM` is unset, that
 * binary prepares the same environment for what it runs as the launcher does (`MSYSTEM`, `HOME`, `PLINK_PROTOCOL`, and
 * its own directories on `PATH`, with `~/bin` ahead of them as in Git Bash), so when the first `git` on `PATH` is that
 * launcher, start the binary itself. The binary skips that setup when `MSYSTEM` is set, and the launcher never does, so
 * a child given `MSYSTEM` keeps the launcher. Anything else found first, such as a wrapper, a shim or a script, keeps
 * the bare name, as does any doubt.
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
  if (spellings(childEnvironment, "MSYSTEM").some(value => value !== undefined)) return "git";
  const [path = "", ...otherPaths] = spellings(childEnvironment, "PATH");
  const [listedPathExt, ...otherPathExts] = spellings(host.environment, "PATHEXT");
  if (otherPaths.length > 0 || otherPathExts.length > 0) return "git";
  const pathExt = listedPathExt || DEFAULT_PATHEXT;
  let known = resolutions.get(host);
  if (known === undefined) {
    known = new Map();
    resolutions.set(host, known);
  }
  const key = `${path}\0${pathExt}`;
  let executable = known.get(key);
  if (executable === undefined) {
    executable = launchedBinary(path, pathExt.split(";").filter(Boolean), host.isFile);
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
