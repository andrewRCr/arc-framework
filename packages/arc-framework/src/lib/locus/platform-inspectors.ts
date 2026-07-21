/** Native Linux, BSD, and Windows process-inspector adapters. */

import { readFile, readlink } from "node:fs/promises";

import type { ProcessInspection, ProcessInspector } from "./process-inspector.js";
import { createProcessExec, type ProcessExec } from "./process-exec.js";

interface LinuxProcessFs {
  readFile(path: string): Promise<string>;
  readlink(path: string): Promise<string>;
  procRoot?: string;
}

/** Build the Linux `/proc` adapter. */
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

/** Build the locale-stable macOS/BSD `ps` adapter. */
export function createBsdProcessInspector(exec: ProcessExec = createProcessExec()): ProcessInspector {
  return {
    kind: "bsd-ps",
    async inspect(pid): Promise<ProcessInspection> {
      const result = await exec("ps", ["-p", String(pid), "-o", "ppid=,lstart=,comm="], {
        env: { LC_ALL: "C", LANG: "C" },
      });
      if (result.kind === "nonzero") {
        return result.stdout.trim() === "" && result.stderr.trim() === ""
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

const WINDOWS_CIM_SCRIPT = [
  "$targetPid = [uint32]$args[0]",
  "$process = Get-CimInstance Win32_Process -Filter \"ProcessId = $targetPid\" -ErrorAction Stop",
  "if ($null -eq $process) { 'null'; exit 0 }",
  "$process | Select-Object ParentProcessId,ExecutablePath,CreationDate | ConvertTo-Json -Compress",
].join("; ");

/** Build the PowerShell/CIM Windows adapter. */
export function createWindowsProcessInspector(exec: ProcessExec = createProcessExec()): ProcessInspector {
  return {
    kind: "windows-cim",
    async inspect(pid): Promise<ProcessInspection> {
      const result = await exec("powershell.exe", [
        "-NoLogo", "-NoProfile", "-NonInteractive", "-Command", WINDOWS_CIM_SCRIPT, String(pid),
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

/** Select the supported native adapter without guessing on unknown platforms. */
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

function parseLinuxStat(stat: string, expectedPid: number): { parentPid: number; startToken: string } | null {
  const openParen = stat.indexOf("(");
  const closeParen = stat.lastIndexOf(")");
  if (openParen < 1 || closeParen <= openParen) return null;
  const pid = Number(stat.slice(0, openParen).trim());
  const fields = stat.slice(closeParen + 1).trim().split(/\s+/u);
  const parentPid = Number(fields[1]);
  const startToken = fields[19];
  if (pid !== expectedPid || !Number.isSafeInteger(parentPid) || parentPid < 0
    || startToken === undefined || !/^\d+$/u.test(startToken)) return null;
  return { parentPid, startToken };
}

function unknownInspection(reason: string): ProcessInspection {
  return { kind: "unverifiable", reason };
}

function errorCode(value: unknown): string | undefined {
  return isRecord(value) && typeof value.code === "string" ? value.code : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}
