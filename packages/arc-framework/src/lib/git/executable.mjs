/** Dependency-free choice of the executable a Git child process starts. */
import { statSync } from "node:fs";
import { win32 } from "node:path";

/**
 * @typedef {object} GitExecutableHost
 * @property {NodeJS.Platform} platform
 * @property {(path: string) => boolean} isFile
 * @property {Record<string, string | undefined>} environment - Read for `PATHEXT`, and for `PATH` when a child
 *   inherits it.
 */

/** @type {GitExecutableHost} */
const PROCESS_HOST = {
  get platform() { return globalThis.process.platform; },
  isFile: (path) => {
    try {
      return statSync(path, { throwIfNoEntry: false })?.isFile() === true;
    } catch {
      return false;
    }
  },
  get environment() { return globalThis.process.env; },
};

const GIT_FOR_WINDOWS_SYSTEMS = ["ucrt64", "mingw64", "clangarm64", "mingw32"];

/** @type {WeakMap<GitExecutableHost, Map<string, string>>} */
const resolutions = new WeakMap();

/**
 * Name the executable that starts Git in a child process with this environment.
 *
 * On Windows, `git` on `PATH` is usually Git for Windows' `cmd\git.exe`, a launcher whose only work is to start
 * `<root>\<system>\bin\git.exe`, which costs a second process start on every call. That binary prepares the same
 * environment for what it runs (`MSYSTEM`, `HOME`, `PLINK_PROTOCOL`, and its own directories on `PATH`, with `~/bin`
 * ahead of them as in Git Bash), so when the first `git` on `PATH` is that launcher, start the binary itself.
 * Anything else found first, such as a wrapper, a shim or a script, keeps the bare name, as does any doubt. The lookup
 * tries each `PATH` entry in order with each `PATHEXT` extension, as execa's command lookup does, but leaves out the
 * working directory that lookup searches first. Its answer is kept for the life of the process.
 * @param {Record<string, string | undefined> | undefined} environment - The child's environment; when omitted, the
 *   child inherits the host's.
 * @param {GitExecutableHost} [host]
 * @returns {string}
 */
export function gitExecutable(environment, host = PROCESS_HOST) {
  if (host.platform !== "win32") return "git";
  const path = variable(environment ?? host.environment, "PATH") ?? "";
  const pathExt = variable(host.environment, "PATHEXT") ?? ".EXE;.CMD;.BAT;.COM";
  let known = resolutions.get(host);
  if (known === undefined) {
    known = new Map();
    resolutions.set(host, known);
  }
  const key = `${path}\0${pathExt}`;
  let executable = known.get(key);
  if (executable === undefined) {
    executable = launchedBinary(path, pathExt.split(";"), host.isFile);
    known.set(key, executable);
  }
  return executable;
}

/**
 * Read a Windows environment variable by any spelling, the last spelling winning as in execa's command lookup.
 * @param {Record<string, string | undefined>} environment
 * @param {string} name
 * @returns {string | undefined}
 */
function variable(environment, name) {
  const key = Object.keys(environment).reverse().find(candidate => candidate.toUpperCase() === name);
  return key === undefined ? undefined : environment[key];
}

/**
 * The binary behind the first `git` on `PATH` when that is Git for Windows' launcher, otherwise the bare name.
 * @param {string} path
 * @param {string[]} extensions
 * @param {(path: string) => boolean} isFile
 * @returns {string}
 */
function launchedBinary(path, extensions, isFile) {
  for (const entry of path.split(";")) {
    const directory = /^".*"$/u.test(entry) ? entry.slice(1, -1) : entry;
    if (directory === "") continue;
    if (!win32.isAbsolute(directory)) return "git";
    const extension = extensions.find(candidate => isFile(win32.join(directory, `git${candidate}`)));
    if (extension === undefined) continue;
    if (extension.toLowerCase() !== ".exe" || win32.basename(directory).toLowerCase() !== "cmd") return "git";
    const [binary, ...others] = GIT_FOR_WINDOWS_SYSTEMS
      .map(system => win32.join(directory, "..", system, "bin", "git.exe"))
      .filter(isFile);
    return binary !== undefined && others.length === 0 ? binary : "git";
  }
  return "git";
}
