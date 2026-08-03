/** Native Linux, BSD, and Windows process-inspector adapters. */

import { readFile, readlink } from "node:fs/promises";

import type {
  AncestorProcessInspection,
  ProcessAncestryInspector,
  ProcessInspection,
  ProcessInspector,
} from "./process-inspector.js";
import { createProcessExec, type ProcessExec } from "./process-exec.js";

export interface LinuxProcessFs {
  readFile(path: string): Promise<string>;
  readlink(path: string): Promise<string>;
  procRoot?: string;
}

/**
 * Build the Linux ancestry adapter with command-line and terminal evidence.
 *
 * @param fs - Linux process filesystem access and optional proc root
 * @returns a Linux process ancestry inspector
 */
export function createLinuxProcessAncestryInspector(
  fs: LinuxProcessFs = {
    readFile: (path) => readFile(path, "utf8"),
    readlink,
  },
): ProcessAncestryInspector {
  const procRoot = fs.procRoot ?? "/proc";
  const base = createLinuxProcessInspector(fs);
  return {
    kind: base.kind,
    async inspectAncestor(pid): Promise<AncestorProcessInspection> {
      const inspected = await base.inspect(pid);
      if (inspected.kind !== "present") return inspected;
      const root = `${procRoot}/${pid}`;
      let stat: string;
      let commandArguments: readonly string[] | null;
      try {
        stat = await fs.readFile(`${root}/stat`);
        commandArguments = parseNullSeparatedArguments(await fs.readFile(`${root}/cmdline`));
      } catch {
        return unknownAncestor("Linux process ancestry evidence is unreadable");
      }
      const generation = parseLinuxStat(stat, pid);
      if (generation === null || generation.startToken !== inspected.startToken || commandArguments === null) {
        return unknownAncestor("Linux process ancestry evidence is malformed");
      }
      const controllingTty = generation.ttyNumber !== "0";
      return {
        kind: "present",
        snapshot: {
          ...inspected,
          commandLine: commandArguments.join(" "),
          commandArguments,
          controllingTty,
          interactive: controllingTty && isShellIdentity(inspected.commandIdentity),
        },
      };
    },
  };
}

/**
 * Build the Linux `/proc` adapter.
 *
 * @param fs - Linux process filesystem access and optional proc root
 * @returns a Linux process inspector
 */
export function createLinuxProcessInspector(
  fs: LinuxProcessFs = {
    readFile: (path) => readFile(path, "utf8"),
    readlink,
  },
): ProcessInspector {
  const procRoot = fs.procRoot ?? "/proc";
  return {
    kind: "linux-proc",
    async inspect(pid): Promise<ProcessInspection> {
      const root = `${procRoot}/${pid}`;
      let stat: string;
      try {
        stat = await fs.readFile(`${root}/stat`);
      } catch (error) {
        return errorCode(error) === "ENOENT"
          ? { kind: "absent" }
          : unknownInspection("Linux process stat is unreadable");
      }
      const parsed = parseLinuxStat(stat, pid);
      if (parsed === null) return unknownInspection("Linux process stat is malformed");

      let commandIdentity: string | null = null;
      try {
        commandIdentity = await fs.readlink(`${root}/exe`);
      } catch (error) {
        if (errorCode(error) !== "ENOENT" && errorCode(error) !== "EACCES") {
          return unknownInspection("Linux process identity is unreadable");
        }
      }
      if (commandIdentity === null || commandIdentity.length === 0) {
        try {
          commandIdentity = (await fs.readFile(`${root}/comm`)).replace(/\n$/u, "");
        } catch {
          return unknownInspection("Linux process identity is unavailable");
        }
      }
      if (commandIdentity.length === 0) return unknownInspection("Linux process identity is empty");
      return {
        kind: "present",
        pid,
        parentPid: parsed.parentPid,
        startToken: parsed.startToken,
        commandIdentity,
      };
    },
  };
}

/**
 * Build the locale-stable macOS/BSD `ps` adapter.
 *
 * @param exec - bounded argument-array process executor
 * @returns a BSD process inspector
 */
export function createBsdProcessInspector(exec: ProcessExec = createProcessExec()): ProcessInspector {
  return {
    kind: "bsd-ps",
    async inspect(pid): Promise<ProcessInspection> {
      const result = await exec("ps", ["-p", String(pid), "-o", "ppid=,lstart=,comm="], {
        env: { LC_ALL: "C", LANG: "C" },
      });
      if (result.kind === "nonzero") {
        return result.stdout.trim() === "" && signalZeroProvesAbsence(pid)
          ? { kind: "absent" }
          : unknownInspection("BSD process query failed");
      }
      if (result.kind !== "success") return unknownInspection("BSD process query is unavailable");
      if (result.stdout.trim() === "") return { kind: "absent" };
      const match = /^\s*(\d+)\s+(.{24})\s+(\S(?:.*\S)?)\s*$/u.exec(result.stdout.replace(/\n$/u, ""));
      if (match?.[1] === undefined || match[2] === undefined || match[3] === undefined) {
        return unknownInspection("BSD process output is malformed");
      }
      const parentPid = Number(match[1]);
      if (!Number.isSafeInteger(parentPid) || parentPid < 0 || match[2].trim().length === 0) {
        return unknownInspection("BSD process output is malformed");
      }
      return {
        kind: "present",
        pid,
        parentPid,
        startToken: match[2],
        commandIdentity: match[3],
      };
    },
  };
}

/**
 * Build the BSD ancestry adapter without relying on localized field labels.
 *
 * @param exec - bounded argument-array process executor
 * @returns a BSD process ancestry inspector
 */
export function createBsdProcessAncestryInspector(
  exec: ProcessExec = createProcessExec(),
): ProcessAncestryInspector {
  const base = createBsdProcessInspector(exec);
  return {
    kind: base.kind,
    async inspectAncestor(pid): Promise<AncestorProcessInspection> {
      const inspected = await base.inspect(pid);
      if (inspected.kind !== "present") return inspected;
      const env = { LC_ALL: "C", LANG: "C" };
      const evidence = await exec("ps", ["-ww", "-p", String(pid), "-o", "lstart=,tty=,command="], { env });
      if (evidence.kind !== "success") {
        return unknownAncestor("BSD process ancestry query is unavailable");
      }
      const evidenceMatch = /^\s*(.{24})\s+(\S+)\s+(\S(?:.*\S)?)\s*$/u
        .exec(evidence.stdout.replace(/\n$/u, ""));
      if (evidenceMatch?.[1] === undefined || evidenceMatch[2] === undefined
        || evidenceMatch[3] === undefined || evidenceMatch[1] !== inspected.startToken) {
        return unknownAncestor("BSD process ancestry output is malformed");
      }
      const ttyValue = evidenceMatch[2];
      const controllingTty = ttyValue !== "??" && ttyValue !== "?" && ttyValue !== "-";
      return {
        kind: "present",
        snapshot: {
          ...inspected,
          commandLine: evidenceMatch[3],
          controllingTty,
          interactive: controllingTty && isShellIdentity(inspected.commandIdentity),
        },
      };
    },
  };
}

/**
 * Build the PowerShell/CIM Windows adapter.
 *
 * @param exec - bounded argument-array process executor
 * @returns a Windows process inspector
 */
export function createWindowsProcessInspector(exec: ProcessExec = createProcessExec()): ProcessInspector {
  return {
    kind: "windows-cim",
    async inspect(pid): Promise<ProcessInspection> {
      const script = windowsCimScript(pid, false);
      if (script === null) return unknownInspection("Windows process PID is invalid");
      const result = await exec("powershell.exe", [
        "-NoLogo", "-NoProfile", "-NonInteractive", "-Command", script,
      ]);
      if (result.kind !== "success") return unknownInspection("Windows CIM query is unavailable");
      let value: unknown;
      try {
        value = JSON.parse(result.stdout);
      } catch {
        return unknownInspection("Windows CIM output is malformed");
      }
      if (value === null) return { kind: "absent" };
      if (!isRecord(value)
        || !isNonNegativeInteger(value.ParentProcessId)
        || typeof value.ExecutablePath !== "string"
        || value.ExecutablePath.length === 0
        || typeof value.CreationDate !== "string"
        || value.CreationDate.length === 0) {
        return unknownInspection("Windows CIM output is malformed");
      }
      return {
        kind: "present",
        pid,
        parentPid: value.ParentProcessId,
        startToken: value.CreationDate,
        commandIdentity: value.ExecutablePath,
      };
    },
  };
}

/**
 * Build the Windows CIM ancestry adapter with exact command-line evidence.
 *
 * @param exec - bounded argument-array process executor
 * @returns a Windows process ancestry inspector
 */
export function createWindowsProcessAncestryInspector(
  exec: ProcessExec = createProcessExec(),
): ProcessAncestryInspector {
  return {
    kind: "windows-cim",
    async inspectAncestor(pid): Promise<AncestorProcessInspection> {
      const script = windowsCimScript(pid, true);
      if (script === null) return unknownAncestor("Windows process PID is invalid");
      const result = await exec("powershell.exe", [
        "-NoLogo", "-NoProfile", "-NonInteractive", "-Command", script,
      ]);
      if (result.kind !== "success") return unknownAncestor("Windows CIM ancestry query is unavailable");
      let value: unknown;
      try {
        value = JSON.parse(result.stdout);
      } catch {
        return unknownAncestor("Windows CIM ancestry output is malformed");
      }
      if (value === null) return { kind: "absent" };
      if (!isRecord(value) || !isNonNegativeInteger(value.ParentProcessId)
        || typeof value.ExecutablePath !== "string" || value.ExecutablePath.length === 0
        || typeof value.CreationDate !== "string" || value.CreationDate.length === 0
        || typeof value.CommandLine !== "string" || value.CommandLine.trim() === "") {
        return unknownAncestor("Windows CIM ancestry output is malformed");
      }
      return {
        kind: "present",
        snapshot: {
          pid,
          parentPid: value.ParentProcessId,
          startToken: value.CreationDate,
          commandIdentity: value.ExecutablePath,
          commandLine: value.CommandLine,
          controllingTty: false,
          interactive: false,
        },
      };
    },
  };
}

/**
 * Select the supported native adapter without guessing on unknown platforms.
 *
 * @param platform - Node platform identifier
 * @param dependencies - optional platform-boundary overrides
 * @returns a native process inspector or an unknown-safe unsupported adapter
 */
export function createPlatformProcessInspector(
  platform: string = process.platform,
  dependencies: { exec?: ProcessExec; linuxFs?: LinuxProcessFs } = {},
): ProcessInspector {
  if (platform === "linux") return createLinuxProcessInspector(dependencies.linuxFs);
  if (platform === "darwin" || platform === "freebsd" || platform === "openbsd" || platform === "netbsd") {
    return createBsdProcessInspector(dependencies.exec);
  }
  if (platform === "win32") return createWindowsProcessInspector(dependencies.exec);
  return {
    kind: `unsupported-${platform}`,
    inspect: () => Promise.resolve(unknownInspection(`Unsupported process-inspector platform: ${platform}`)),
  };
}

/**
 * Select the supported native ancestry adapter without guessing on unknown platforms.
 *
 * @param platform - Node platform identifier
 * @param dependencies - optional platform-boundary overrides
 * @returns a native ancestry inspector or an unknown-safe unsupported adapter
 */
export function createPlatformProcessAncestryInspector(
  platform: string = process.platform,
  dependencies: { exec?: ProcessExec; linuxFs?: LinuxProcessFs } = {},
): ProcessAncestryInspector {
  if (platform === "linux") return createLinuxProcessAncestryInspector(dependencies.linuxFs);
  if (platform === "darwin" || platform === "freebsd" || platform === "openbsd" || platform === "netbsd") {
    return createBsdProcessAncestryInspector(dependencies.exec);
  }
  if (platform === "win32") return createWindowsProcessAncestryInspector(dependencies.exec);
  return {
    kind: `unsupported-${platform}`,
    inspectAncestor: () => Promise.resolve(unknownAncestor(`Unsupported process-inspector platform: ${platform}`)),
  };
}

function parseLinuxStat(
  stat: string,
  expectedPid: number,
): { parentPid: number; startToken: string; ttyNumber: string } | null {
  const openParen = stat.indexOf("(");
  const closeParen = stat.lastIndexOf(")");
  if (openParen < 1 || closeParen <= openParen) return null;
  const pid = Number(stat.slice(0, openParen).trim());
  const fields = stat.slice(closeParen + 1).trim().split(/\s+/u);
  const parentPid = Number(fields[1]);
  const startToken = fields[19];
  const ttyNumber = fields[4];
  if (pid !== expectedPid || !Number.isSafeInteger(parentPid) || parentPid < 0
    || startToken === undefined || !/^\d+$/u.test(startToken)
    || ttyNumber === undefined || !/^-?\d+$/u.test(ttyNumber)) return null;
  return { parentPid, startToken, ttyNumber };
}

function unknownInspection(reason: string): ProcessInspection {
  return { kind: "unverifiable", reason };
}

function unknownAncestor(reason: string): AncestorProcessInspection {
  return { kind: "unverifiable", reason };
}

function parseNullSeparatedArguments(value: string): readonly string[] | null {
  if (!value.includes("\0")) return null;
  const args = value.split("\0");
  while (args.at(-1) === "") args.pop();
  return args.length === 0 || args[0] === "" ? null : args;
}

function isShellIdentity(identity: string): boolean {
  const executable = identity.replaceAll("\\", "/").split("/").at(-1)?.toLowerCase() ?? "";
  return executable === "bash" || executable === "zsh" || executable === "fish" || executable === "sh"
    || executable === "dash" || executable === "pwsh" || executable === "powershell.exe";
}

function errorCode(value: unknown): string | undefined {
  return isRecord(value) && typeof value.code === "string" ? value.code : undefined;
}

function signalZeroProvesAbsence(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return false;
  } catch (error) {
    return errorCode(error) === "ESRCH";
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function windowsCimScript(pid: number, includeCommandLine: boolean): string | null {
  if (!Number.isSafeInteger(pid) || pid < 0 || pid > 0xffff_ffff) return null;
  const fields = includeCommandLine
    ? "ParentProcessId,ExecutablePath,CreationDate,CommandLine"
    : "ParentProcessId,ExecutablePath,CreationDate";
  return [
    `$process = Get-CimInstance Win32_Process -Filter "ProcessId = ${pid}" -ErrorAction Stop`,
    "if ($null -eq $process) { 'null'; exit 0 }",
    `$process | Select-Object ${fields} | ConvertTo-Json -Compress`,
  ].join("; ");
}
