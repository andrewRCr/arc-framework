/** Native Windows command-line accounting at the final executable argument boundary. */
import { GitProcessError } from "./process-error.js";

/** UTF-16 units in the native Windows process command line, including separators and the terminating NUL. */
export function nativeWindowsCommandLineUnits(command: string, args: readonly string[]): number {
  return [command, ...args].reduce((total, value) => total + quotedWindowsUnits(value) + 1, 0);
}

/** Refuse an oversized native Git invocation before creating its process. */
export function assertNativeGitCommandLineCapacity(command: string, args: readonly string[], platform: NodeJS.Platform = process.platform): void {
  if (platform !== "win32") return;
  const units = nativeWindowsCommandLineUnits(command, args), limit = 32_767;
  if (units > limit) throw new GitProcessError({ kind: "command-line-capacity", command, args, commandLine: { units, limit } });
}

function quotedWindowsUnits(value: string): number {
  if (value.length === 0) return 2;
  if (!/[ \t"]/u.test(value)) return value.length;
  let units = value.length + 2, slashes = 0;
  for (const character of value) {
    if (character === "\\") { slashes += 1; continue; }
    if (character === '"') units += slashes + 1;
    slashes = 0;
  }
  return units + slashes;
}
