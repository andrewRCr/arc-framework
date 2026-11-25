import { describe, expect, it } from "vitest";
import { addressSpaceBackstop, compilerSoftLimit, parseAddressSpaceLimits } from "../../../../src/scripts/typecheck/memory-bound.js";

describe("address-space backstop", () => {
  it("adds the provisional margin and expresses the ceiling in KiB", () => {
    expect(addressSpaceBackstop(6000, {})).toBe(7817 * 1024);
  });
  it.each(["soft", "hard"] as const)("keeps a lower inherited %s ceiling", column => {
    expect(addressSpaceBackstop(6000, { [column]: 2 * 1024 ** 3 })).toBeUndefined();
  });
  it("parses both inherited columns", () => {
    expect(parseAddressSpaceLimits("Max address space         2147483648           4294967296           bytes"))
      .toEqual({ soft: 2147483648, hard: 4294967296 });
  });
  it("reads unlimited columns as absent ceilings", () => {
    expect(parseAddressSpaceLimits("Max address space         unlimited            unlimited            bytes"))
      .toEqual({});
  });
});

const mib = 1024 ** 2;
function cgroupFiles(values: Record<string, string>) {
  return (path: string): string => {
    const value = values[path];
    if (value === undefined) throw new Error(`ENOENT: ${path}`);
    return value;
  };
}
const ownCgroup = { "/proc/self/cgroup": "0::/parent/job\n" };

describe("cgroup compiler target", () => {
  it("leaves 512 MiB under a numeric 5120 MiB job cap", () => {
    expect(compilerSoftLimit("linux", cgroupFiles({ ...ownCgroup, "/sys/fs/cgroup/parent/job/memory.max": String(5120 * mib) })))
      .toBe(4608);
  });
  it("uses the smallest nested numeric cap", () => {
    expect(compilerSoftLimit("linux", cgroupFiles({ ...ownCgroup,
      "/sys/fs/cgroup/parent/job/memory.max": String(8192 * mib),
      "/sys/fs/cgroup/parent/memory.max": String(5120 * mib),
      "/sys/fs/cgroup/memory.max": "max",
    }))).toBe(4608);
  });
  it("keeps 6000 MiB below a larger cap", () => {
    expect(compilerSoftLimit("linux", cgroupFiles({ ...ownCgroup, "/sys/fs/cgroup/parent/job/memory.max": String(8192 * mib) })))
      .toBe(6000);
  });
  it("treats max as no bound", () => {
    expect(compilerSoftLimit("linux", cgroupFiles({ ...ownCgroup, "/sys/fs/cgroup/parent/job/memory.max": "max" }))).toBe(6000);
  });
  it("treats missing memory.max files as no bound", () => {
    expect(compilerSoftLimit("linux", cgroupFiles(ownCgroup))).toBe(6000);
  });
  it("treats a missing unified hierarchy as no bound", () => {
    expect(compilerSoftLimit("linux", cgroupFiles({ "/proc/self/cgroup": "5:memory:/parent/job\n", "/sys/fs/cgroup/memory.max": String(1024 * mib) })))
      .toBe(6000);
  });
  it("uses the default on other platforms", () => {
    expect(compilerSoftLimit("darwin", cgroupFiles({}))).toBe(6000);
  });
  it("derives the backstop from the bounded soft limit", () => {
    const soft = compilerSoftLimit("linux", cgroupFiles({ ...ownCgroup, "/sys/fs/cgroup/parent/job/memory.max": String(5120 * mib) }));
    expect(addressSpaceBackstop(soft, {})).toBe(6425 * 1024);
  });
  it("refuses a cap with no compiler headroom and succeeds after the cap is repaired", () => {
    const values = { ...ownCgroup, "/sys/fs/cgroup/parent/job/memory.max": String(512 * mib) };
    expect(() => compilerSoftLimit("linux", cgroupFiles(values))).toThrow(/increase.*memory.*retry/i);
    values["/sys/fs/cgroup/parent/job/memory.max"] = String(5120 * mib);
    expect(compilerSoftLimit("linux", cgroupFiles(values))).toBe(4608);
  });
});
