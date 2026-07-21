/** Native process-inspector adapter contracts. */

import { describe, expect, it, vi } from "vitest";

import {
  createBsdProcessInspector,
  createBsdProcessAncestryInspector,
  createLinuxProcessAncestryInspector,
  createLinuxProcessInspector,
  createPlatformProcessAncestryInspector,
  createPlatformProcessInspector,
  createWindowsProcessAncestryInspector,
  createWindowsProcessInspector,
} from "../../../src/lib/locus/platform-inspectors.js";
import type { ProcessExec } from "../../../src/lib/locus/process-exec.js";

function procStat(pid: number, parentPid: number, startToken: string, ttyNumber = "0"): string {
  const middle = ["0", "0", ttyNumber, ...Array.from({ length: 14 }, () => "0")].join(" ");
  return `${pid} (codex worker) S ${parentPid} ${middle} ${startToken} 0\n`;
}

describe("Linux process inspector", () => {
  it("parses parent PID and start ticks while resolving command identity", async () => {
    const inspector = createLinuxProcessInspector({
      readFile: async (path) => path.endsWith("/stat") ? procStat(42, 7, "12345") : "codex\n",
      readlink: async () => "/opt/codex",
      procRoot: "/proc",
    });
    await expect(inspector.inspect(42)).resolves.toEqual({
      kind: "present", pid: 42, parentPid: 7, startToken: "12345", commandIdentity: "/opt/codex",
    });
  });

  it("captures exact command-line and terminal evidence for ancestry selection", async () => {
    const inspector = createLinuxProcessAncestryInspector({
      readFile: async (path) => {
        if (path.endsWith("/stat")) return procStat(42, 7, "12345", "34817");
        if (path.endsWith("/cmdline")) return "node\0/repo/dist/cli.js\0errand\0open\0";
        return "node\n";
      },
      readlink: async () => "/usr/bin/node",
      procRoot: "/proc",
    });
    await expect(inspector.inspectAncestor(42)).resolves.toMatchObject({
      kind: "present",
      snapshot: { commandLine: "node /repo/dist/cli.js errand open", controllingTty: true },
    });
  });

  it("distinguishes absence from permission, parse, and identity uncertainty", async () => {
    const failure = (code: string) => Object.assign(new Error(code), { code });
    await expect(createLinuxProcessInspector({
      readFile: async () => { throw failure("ENOENT"); }, readlink: async () => "", procRoot: "/proc",
    }).inspect(42)).resolves.toEqual({ kind: "absent" });
    await expect(createLinuxProcessInspector({
      readFile: async () => { throw failure("EACCES"); }, readlink: async () => "", procRoot: "/proc",
    }).inspect(42)).resolves.toMatchObject({ kind: "unverifiable" });
    await expect(createLinuxProcessInspector({
      readFile: async () => "malformed", readlink: async () => "", procRoot: "/proc",
    }).inspect(42)).resolves.toMatchObject({ kind: "unverifiable" });
  });
});

describe("BSD process inspector", () => {
  it("uses a locale-stable argument-array ps query and preserves the start token", async () => {
    const exec = vi.fn<ProcessExec>(async () => ({
      kind: "success", stdout: "7 Mon Jul 18 00:00:00 2026 /opt/codex\n", stderr: "", exitCode: 0,
    }));
    await expect(createBsdProcessInspector(exec).inspect(42)).resolves.toEqual({
      kind: "present", pid: 42, parentPid: 7,
      startToken: "Mon Jul 18 00:00:00 2026", commandIdentity: "/opt/codex",
    });
    expect(exec).toHaveBeenCalledWith("ps", ["-p", "42", "-o", "ppid=,lstart=,comm="], {
      env: { LC_ALL: "C", LANG: "C" },
    });
  });

  it("pins ancestry command and terminal queries to argument arrays", async () => {
    const exec = vi.fn<ProcessExec>(async (_command, args) => {
      const fields = args.at(-1);
      if (fields === "ppid=,lstart=,comm=") {
        return { kind: "success", stdout: "7 Mon Jul 18 00:00:00 2026 /opt/codex\n", stderr: "", exitCode: 0 };
      }
      if (fields === "lstart=,command=") {
        return { kind: "success", stdout: "Mon Jul 18 00:00:00 2026 codex --session x\n", stderr: "", exitCode: 0 };
      }
      return { kind: "success", stdout: "ttys001\n", stderr: "", exitCode: 0 };
    });
    await expect(createBsdProcessAncestryInspector(exec).inspectAncestor(42)).resolves.toMatchObject({
      kind: "present", snapshot: { commandLine: "codex --session x", controllingTty: true },
    });
  });

  it("degrades malformed, denied, and unavailable output safely", async () => {
    const fixtures = [
      { kind: "success" as const, stdout: "localized nonsense", stderr: "", exitCode: 0 as const },
      { kind: "nonzero" as const, stdout: "", stderr: "permission denied", exitCode: 1 },
      { kind: "missing" as const, message: "missing" },
    ];
    for (const fixture of fixtures) {
      await expect(createBsdProcessInspector(async () => fixture).inspect(42))
        .resolves.toMatchObject({ kind: "unverifiable" });
    }
  });
});

describe("Windows process inspector", () => {
  it("passes the PID separately and maps compressed CIM JSON", async () => {
    const exec = vi.fn<ProcessExec>(async () => ({
      kind: "success",
      stdout: JSON.stringify({ ParentProcessId: 7, ExecutablePath: "C:\\Tools\\codex.exe", CreationDate: "20260718000000.000000-000" }),
      stderr: "", exitCode: 0,
    }));
    await expect(createWindowsProcessInspector(exec).inspect(42)).resolves.toEqual({
      kind: "present", pid: 42, parentPid: 7, startToken: "20260718000000.000000-000",
      commandIdentity: "C:\\Tools\\codex.exe",
    });
    const call = vi.mocked(exec).mock.calls[0];
    expect(call?.[0]).toBe("powershell.exe");
    expect(call?.[1].at(-1)).toBe("42");
  });

  it("captures the CIM command line for ancestry selection", async () => {
    const exec: ProcessExec = async () => ({
      kind: "success",
      stdout: JSON.stringify({
        ParentProcessId: 7,
        ExecutablePath: "C:\\Tools\\codex.exe",
        CreationDate: "20260718000000.000000-000",
        CommandLine: "codex --session x",
      }),
      stderr: "",
      exitCode: 0,
    });
    await expect(createWindowsProcessAncestryInspector(exec).inspectAncestor(42)).resolves.toMatchObject({
      kind: "present", snapshot: { commandLine: "codex --session x" },
    });
  });

  it("maps null to absence and every untrusted failure to unknown", async () => {
    await expect(createWindowsProcessInspector(async () => ({
      kind: "success", stdout: "null", stderr: "", exitCode: 0,
    })).inspect(42)).resolves.toEqual({ kind: "absent" });
    await expect(createWindowsProcessInspector(async () => ({
      kind: "success", stdout: "{bad", stderr: "", exitCode: 0,
    })).inspect(42)).resolves.toMatchObject({ kind: "unverifiable" });
  });
});

describe("platform inspector selection", () => {
  it("selects supported adapters and keeps unsupported platforms unknown", async () => {
    const exec: ProcessExec = async () => ({ kind: "missing", message: "fixture" });
    expect(createPlatformProcessInspector("linux", { exec }).kind).toBe("linux-proc");
    expect(createPlatformProcessInspector("darwin", { exec }).kind).toBe("bsd-ps");
    expect(createPlatformProcessInspector("freebsd", { exec }).kind).toBe("bsd-ps");
    expect(createPlatformProcessInspector("win32", { exec }).kind).toBe("windows-cim");
    expect(createPlatformProcessAncestryInspector("linux", { exec }).kind).toBe("linux-proc");
    expect(createPlatformProcessAncestryInspector("darwin", { exec }).kind).toBe("bsd-ps");
    expect(createPlatformProcessAncestryInspector("win32", { exec }).kind).toBe("windows-cim");
    await expect(createPlatformProcessInspector("aix", { exec }).inspect(42))
      .resolves.toMatchObject({ kind: "unverifiable" });
  });
});
