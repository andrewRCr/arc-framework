import { win32 } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import { gitExecutable, type GitExecutableHost } from "../../../src/lib/git/executable.mjs";

const GIT = "C:\\Program Files\\Git";
const LAUNCHER = `${GIT}\\cmd\\git.exe`;
const SYSTEM32 = "C:\\Windows\\system32";

function windowsHost(files: string[], environment: Record<string, string> = {}): GitExecutableHost & { probes: number } {
  const present = new Set(files.map(file => win32.normalize(file).toLowerCase()));
  const host = {
    platform: "win32" as NodeJS.Platform,
    environment: { PATHEXT: ".COM;.EXE;.BAT;.CMD", ...environment },
    probes: 0,
    isFile(path: string): boolean {
      host.probes++;
      return present.has(win32.normalize(path).toLowerCase());
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

  it("reads PATH by its last spelling, and the host's when the child inherits it", () => {
    const host = windowsHost([LAUNCHER, `${GIT}\\ucrt64\\bin\\git.exe`, "C:\\tools\\git.cmd"],
      { Path: `${GIT}\\cmd` });

    expect(gitExecutable({ PATH: "C:\\tools", Path: `${GIT}\\cmd` }, host)).toBe(`${GIT}\\ucrt64\\bin\\git.exe`);
    expect(gitExecutable({ Path: `${GIT}\\cmd`, PATH: "C:\\tools" }, host)).toBe("git");
    expect(gitExecutable(undefined, host)).toBe(`${GIT}\\ucrt64\\bin\\git.exe`);
  });

  it("follows the host's PATHEXT order and falls back to Windows' default list", () => {
    const files = [LAUNCHER, `${GIT}\\ucrt64\\bin\\git.exe`, `${GIT}\\cmd\\git.bat`];

    expect(gitExecutable({ PATH: `${GIT}\\cmd` }, windowsHost(files, { PATHEXT: ".BAT;.EXE" }))).toBe("git");
    const defaults = { ...windowsHost(files), environment: {} };
    expect(gitExecutable({ PATH: `${GIT}\\cmd` }, defaults)).toBe(`${GIT}\\ucrt64\\bin\\git.exe`);
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
