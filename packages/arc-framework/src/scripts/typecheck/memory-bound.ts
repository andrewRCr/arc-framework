/** Memory envelope for each native compiler, in MiB unless a name states otherwise. */
import { readFileSync } from "node:fs";
import { posix } from "node:path";
export const SOFT_LIMIT_MIB = 6000;
export const BACKSTOP_MARGIN_MIB = 1817;

/** Inherited address-space ceilings from Linux procfs, in bytes. */
export interface AddressSpaceLimits { soft?: number; hard?: number }

/** Read both address-space columns, treating unlimited as absence of a ceiling. */
export function parseAddressSpaceLimits(text: string): AddressSpaceLimits {
  const match = /^Max address space\s+(\d+|unlimited)\s+(\d+|unlimited)/m.exec(text);
  if (!match) throw new Error("Cannot read inherited Max address space from /proc/self/limits.");
  return {
    ...(match[1] === "unlimited" ? {} : { soft: Number(match[1]) }),
    ...(match[2] === "unlimited" ? {} : { hard: Number(match[2]) }),
  };
}

/** Return the shell backstop in KiB, or preserve a lower inherited ceiling. */
export function addressSpaceBackstop(softLimitMiB: number, limits: AddressSpaceLimits): number | undefined {
  const backstopKiB = (softLimitMiB + BACKSTOP_MARGIN_MIB) * 1024;
  const belowBackstop = (value: number | undefined): boolean => value !== undefined && value < backstopKiB * 1024;
  return belowBackstop(limits.soft) || belowBackstop(limits.hard) ? undefined : backstopKiB;
}

/** Choose a Go memory target below the smallest applicable Linux cgroup v2 ceiling. */
export function compilerSoftLimit(platform: string, readFile: (path: string) => string = path => readFileSync(path, "utf8")): number {
  if (platform !== "linux") return SOFT_LIMIT_MIB;
  const bound = cgroupBoundMiB(readFile);
  if (bound === undefined) return SOFT_LIMIT_MIB;
  const soft = Math.min(SOFT_LIMIT_MIB, Math.floor(bound) - 512);
  if (soft <= 0) throw new Error("Cgroup has no compiler headroom; increase job memory above 512 MiB and retry.");
  return soft;
}

function optionalText(path: string, readFile: (path: string) => string): string {
  try { return readFile(path).trim(); } catch { return ""; }
}

function cgroupBoundMiB(readFile: (path: string) => string): number | undefined {
  const entry = optionalText("/proc/self/cgroup", readFile).split("\n").find(line => line.startsWith("0::"));
  if (entry === undefined) return undefined;
  const root = "/sys/fs/cgroup";
  let directory = posix.resolve(root, `.${entry.slice(3)}`);
  let smallest: number | undefined;
  while (directory === root || directory.startsWith(`${root}/`)) {
    const value = optionalText(posix.join(directory, "memory.max"), readFile);
    if (/^\d+$/.test(value)) smallest = Math.min(smallest ?? Infinity, Number(value) / 1024 ** 2);
    if (directory === root) break;
    directory = posix.dirname(directory);
  }
  return smallest;
}
