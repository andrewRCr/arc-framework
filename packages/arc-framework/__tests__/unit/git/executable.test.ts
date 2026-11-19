import { win32 } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import { gitExecutable, type GitExecutableHost } from "../../../src/lib/git/executable.mjs";

const GIT = "C:\\Program Files\\Git";
const LAUNCHER = `${GIT}\\cmd\\git.exe`;
const SYSTEM32 = "C:\\Windows\\system32";

function windowsHost(
  files: string[], environment: Record<string, string> = {}, directories: string[] = [],
): GitExecutableHost & { probes: number } {
  const present = new Set(files.map(file => win32.normalize(file).toLowerCase()));
  const folders = new Set(directories.map(directory => win32.normalize(directory).toLowerCase()));
  const host = {
    platform: "win32" as NodeJS.Platform,
    environment: { PATHEXT: ".COM;.EXE;.BAT;.CMD", ...environment },
    probes: 0,
    isFile(path: string): boolean {
      host.probes++;
      return present.has(win32.normalize(path).toLowerCase());
    },
    isDirectory(path: string): boolean {
      host.probes++;
      return folders.has(win32.normalize(path).toLowerCase());
    },
  };
  return host;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("the executable a Git child starts", () => {
  it("keeps the bare name off Windows, whatever is installed", () => {
    const host = { ...windowsHost([LAUNCHER, `${GIT}\\mingw64\\bin\\git.exe`]), platform: "linux" as NodeJS.Platform };

    expect(gitExecutable({ PATH: `${GIT}\\cmd` }, host)).toBe("git");
  });

  it.each(["ucrt64", "mingw64", "clangarm64", "mingw32"])(
    "starts the %s binary that Git for Windows' cmd launcher would start",
    (system) => {
      const host = windowsHost([LAUNCHER, `${GIT}\\${system}\\bin\\git.exe`]);

      expect(gitExecutable({ Path: `${SYSTEM32};${GIT}\\cmd` }, host)).toBe(`${GIT}\\${system}\\bin\\git.exe`);
    },
  );

  it.each([
    ["a wrapper script earlier on PATH", ["C:\\tools\\git.cmd"], "C:\\tools;C:\\Program Files\\Git\\cmd"],
    ["another git.exe earlier on PATH", ["C:\\shims\\git.exe"], "C:\\shims;C:\\Program Files\\Git\\cmd"],
    ["the binary's own directory first", [], "C:\\Program Files\\Git\\mingw64\\bin;C:\\Program Files\\Git\\cmd"],
    ["an earlier extension beside the launcher", ["C:\\Program Files\\Git\\cmd\\git.com"], "C:\\Program Files\\Git\\cmd"],
    ["a relative PATH entry before the launcher", [], ".\\tools;C:\\Program Files\\Git\\cmd"],
  ])("keeps the bare name when %s could answer to git", (_case, files, path) => {
    const host = windowsHost([LAUNCHER, `${GIT}\\mingw64\\bin\\git.exe`, ...files]);

    expect(gitExecutable({ PATH: path }, host)).toBe("git");
  });

  it.each([
    ["a git.com sits beside the launcher, though PATHEXT lists .EXE first", [`${GIT}\\cmd\\git.com`],
      `${GIT}\\cmd`, ".EXE;.COM"],
    ["a git.com sits earlier on PATH, though PATHEXT leaves .COM out", ["C:\\tools\\git.com"],
      `C:\\tools;${GIT}\\cmd`, ".EXE"],
    ["PATHEXT does not list .EXE", [], `${GIT}\\cmd`, ".COM;.BAT"],
  ])("keeps the bare name when %s, since Node tries git.com and then git.exe in each directory", (
    _case, files, path, pathExt,
  ) => {
    const host = windowsHost([LAUNCHER, `${GIT}\\ucrt64\\bin\\git.exe`, ...files], { PATHEXT: pathExt });

    expect(gitExecutable({ PATH: path }, host)).toBe("git");
  });

  it("keeps the launcher when Git's home has a bin directory, which the binary would put first on PATH", () => {
    const binary = `${GIT}\\ucrt64\\bin\\git.exe`;
    const host = windowsHost([LAUNCHER, binary], {}, ["C:\\Users\\me\\bin"]);
    const path = `${GIT}\\cmd`;

    expect(gitExecutable({ PATH: path, HOME: "C:\\Users\\me" }, host)).toBe("git");
    expect(gitExecutable({ PATH: path, USERPROFILE: "C:\\Users\\me" }, host)).toBe("git");
    expect(gitExecutable({ PATH: path, HOMEDRIVE: "C:", HOMEPATH: "\\Users\\me" }, host)).toBe("git");
    expect(gitExecutable({ PATH: path, HOME: "/c/Users/me" }, host)).toBe("git");
    expect(gitExecutable({ PATH: path, HOME: "C:\\Users\\other", USERPROFILE: "C:\\Users\\me" }, host)).toBe(binary);
    expect(gitExecutable({ PATH: path, USERPROFILE: "C:\\Users\\other" }, host)).toBe(binary);
  });

  it("keeps the launcher when the child's environment sets MSYSTEM, even to nothing", () => {
    const files = [LAUNCHER, `${GIT}\\ucrt64\\bin\\git.exe`];
    const host = windowsHost(files);

    expect(gitExecutable({ PATH: `${GIT}\\cmd`, MSYSTEM: "UCRT64" }, host)).toBe("git");
    expect(gitExecutable({ PATH: `${GIT}\\cmd`, msystem: "" }, host)).toBe("git");
    expect(gitExecutable(undefined, windowsHost(files, { Path: `${GIT}\\cmd`, MSYSTEM: "MINGW64" }))).toBe("git");
    expect(gitExecutable({ PATH: `${GIT}\\cmd` }, windowsHost(files, { MSYSTEM: "MINGW64" })))
      .toBe(`${GIT}\\ucrt64\\bin\\git.exe`);
  });

  it.each([
    ["no binary beside the launcher", [LAUNCHER]],
    ["two binaries beside the launcher", [LAUNCHER, `${GIT}\\mingw64\\bin\\git.exe`, `${GIT}\\ucrt64\\bin\\git.exe`]],
    ["no git on PATH at all", []],
  ])("keeps the bare name with %s", (_case, files) => {
    expect(gitExecutable({ PATH: `${SYSTEM32};${GIT}\\cmd` }, windowsHost(files))).toBe("git");
  });

  it("skips empty entries and unquotes quoted ones", () => {
    const host = windowsHost([LAUNCHER, `${GIT}\\ucrt64\\bin\\git.exe`]);

    expect(gitExecutable({ PATH: `;;"${GIT}\\cmd";` }, host)).toBe(`${GIT}\\ucrt64\\bin\\git.exe`);
  });

  it("reads PATH in any spelling, and the host's when the child inherits it", () => {
    const host = windowsHost([LAUNCHER, `${GIT}\\ucrt64\\bin\\git.exe`], { Path: `${GIT}\\cmd` });

    expect(gitExecutable({ path: `${GIT}\\cmd` }, host)).toBe(`${GIT}\\ucrt64\\bin\\git.exe`);
    expect(gitExecutable({ Path: `${GIT}\\cmd`, PATH: `${GIT}\\cmd` }, host)).toBe(`${GIT}\\ucrt64\\bin\\git.exe`);
    expect(gitExecutable(undefined, host)).toBe(`${GIT}\\ucrt64\\bin\\git.exe`);
  });

  it("keeps the bare name when PATH or PATHEXT is spelled two ways with different values", () => {
    const files = [LAUNCHER, `${GIT}\\ucrt64\\bin\\git.exe`];
    const host = windowsHost(files);
    const launcherLast = `${SYSTEM32};${GIT}\\cmd`;

    expect(gitExecutable({ PATH: `${GIT}\\cmd`, Path: launcherLast }, host)).toBe("git");
    expect(gitExecutable({ Path: launcherLast, PATH: `${GIT}\\cmd` }, host)).toBe("git");
    expect(gitExecutable({ PATH: `${GIT}\\cmd` }, windowsHost(files, { PATHEXT: ".EXE", PathExt: ".EXE;.CMD" })))
      .toBe("git");
  });

  it("follows the host's PATHEXT order, and execa's default list when PATHEXT is unset or empty", () => {
    const files = [LAUNCHER, `${GIT}\\ucrt64\\bin\\git.exe`, `${GIT}\\cmd\\git.bat`];
    const wrapped = [...files, "C:\\tools\\git.js"];
    const path = `C:\\tools;${GIT}\\cmd`;

    expect(gitExecutable({ PATH: `${GIT}\\cmd` }, windowsHost(files, { PATHEXT: ".BAT;.EXE" }))).toBe("git");
    expect(gitExecutable({ PATH: `${GIT}\\cmd` }, { ...windowsHost(files), environment: {} }))
      .toBe(`${GIT}\\ucrt64\\bin\\git.exe`);
    expect(gitExecutable({ PATH: path }, windowsHost(wrapped))).toBe(`${GIT}\\ucrt64\\bin\\git.exe`);
    expect(gitExecutable({ PATH: path }, { ...windowsHost(wrapped), environment: {} })).toBe("git");
    expect(gitExecutable({ PATH: path }, windowsHost(wrapped, { PATHEXT: "" }))).toBe("git");
  });

  it("counts a git that stat refuses with EACCES as found, as execa's lookup does", async () => {
    const alias = "C:\\Users\\me\\AppData\\Local\\Microsoft\\WindowsApps\\git.exe";
    const binary = `${GIT}\\ucrt64\\bin\\git.exe`;
    vi.resetModules();
    vi.doMock("node:fs", async (importOriginal) => ({
      ...await importOriginal<typeof import("node:fs")>(),
      statSync: (path: string) => {
        if (path === alias) throw Object.assign(new Error("access denied"), { code: "EACCES" });
        return path === LAUNCHER || path === binary ? { isFile: () => true } : undefined;
      },
    }));
    try {
      const { gitExecutable: resolve } = await import("../../../src/lib/git/executable.mjs");
      vi.stubGlobal("process", { ...process, platform: "win32", env: { PATHEXT: ".COM;.EXE" } });

      expect(resolve({ PATH: `${GIT}\\cmd` })).toBe(binary);
      expect(resolve({ PATH: `${win32.dirname(alias)};${GIT}\\cmd` })).toBe("git");
    } finally {
      vi.doUnmock("node:fs");
      vi.resetModules();
    }
  });

  it("treats a PATH entry it cannot inspect as holding no git", () => {
    vi.stubGlobal("process", { ...process, platform: "win32" });

    expect(gitExecutable({ PATH: `C:\\${"x".repeat(300)};C:\\missing` })).toBe("git");
  });

  it("looks a PATH up once and a different PATH again", () => {
    const host = windowsHost([LAUNCHER, `${GIT}\\ucrt64\\bin\\git.exe`]);
    const environment = { PATH: `${SYSTEM32};${GIT}\\cmd` };

    expect(gitExecutable(environment, host)).toBe(`${GIT}\\ucrt64\\bin\\git.exe`);
    const firstLookup = host.probes;
    expect(gitExecutable({ ...environment }, host)).toBe(`${GIT}\\ucrt64\\bin\\git.exe`);
    expect(host.probes).toBe(firstLookup);
    expect(gitExecutable({ PATH: `${GIT}\\cmd` }, host)).toBe(`${GIT}\\ucrt64\\bin\\git.exe`);
    expect(host.probes).toBeGreaterThan(firstLookup);
  });
});
