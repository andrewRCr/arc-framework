import { afterEach, describe, expect, it, vi } from "vitest";
import { formatPeakLine, parsePeakMiB, samplePeak, watchPeak, type PeakIO } from "../../../../src/scripts/typecheck/peak.js";

const native = "/deps/native/tsc";
function proc(executable: string, kib: number): PeakIO {
  return { readlink: () => executable, readFile: () => `Name:\ttsc\nVmHWM:\t${kib} kB\nVmRSS:\t42 kB\n` };
}

afterEach(() => { vi.useRealTimers(); });

describe("native executable peak", () => {
  it("keeps a missing kernel high-water mark unavailable", () => {
    expect(parsePeakMiB("Name:\tnode\n")).toBeUndefined();
  });
  it("reads the kernel high-water mark in MiB", () => {
    expect(parsePeakMiB("VmRSS:\t900 kB\nVmHWM:\t1536 kB\n")).toBe(1.5);
  });
  it("ignores the launcher high-water mark", () => {
    const launcher = samplePeak(12, native, {}, proc("/runtime/node", 40000));
    expect(launcher.rssMiB).toBeUndefined();
  });
  it("retains the largest native high-water mark", () => {
    const first = samplePeak(12, native, {}, proc(native, 2048));
    const peak = samplePeak(12, native, first, proc(native, 4096));
    expect(samplePeak(12, native, peak, proc(native, 1024)).rssMiB).toBe(4);
  });
  it("reports the executable seen when it never becomes the native compiler", () => {
    const state = samplePeak(12, native, {}, proc("/runtime/node", 40000));
    expect(state).toEqual({ observedExecutable: "/runtime/node" });
    expect(formatPeakLine({ check: "typecheck:test", shard: "store", softLimitMiB: 6000, peak: state }))
      .toBe("typecheck:test [store]: peak: unavailable (observed: /runtime/node); soft limit: 6000 MiB");
  });
  it("does not count a sample across an executable change", () => {
    let reads = 0;
    const state = samplePeak(12, native, {}, {
      readlink: () => ++reads === 1 ? native : "/other/executable", readFile: () => "VmHWM:\t8192 kB\n",
    });
    expect(state.rssMiB).toBeUndefined();
  });
  it("reports unavailable without procfs", () => {
    const io: PeakIO = { readlink: () => { throw new Error("ENOENT"); }, readFile: () => "" };
    expect(formatPeakLine({ check: "typecheck", peak: samplePeak(12, native, {}, io), softLimitMiB: 6000 }))
      .toBe("typecheck: peak: unavailable; soft limit: 6000 MiB");
  });
  it("prints the check, optional shard and whole MiB", () => {
    expect(formatPeakLine({ check: "typecheck:test", shard: "integration-store", peak: { rssMiB: 1234.1 }, softLimitMiB: 6000 }))
      .toBe("typecheck:test [integration-store]: peak: 1235 MiB; soft limit: 6000 MiB");
  });
  it("polls until stopped and makes no later reads", () => {
    vi.useFakeTimers();
    let kib = 1024;
    const stop = watchPeak(12, native, "linux", { readlink: () => native, readFile: () => `VmHWM:\t${kib} kB\n` });
    kib = 4096;
    vi.advanceTimersByTime(40);
    expect(stop().rssMiB).toBe(4);
    kib = 8192;
    vi.advanceTimersByTime(40);
    expect(stop().rssMiB).toBe(4);
  });
  it("reports an unavailable peak on other platforms", () => {
    const stop = watchPeak(12, native, "darwin", {
      readlink: () => { throw new Error("must not read"); }, readFile: () => "VmHWM:\t8192 kB\n",
    });
    expect(stop()).toEqual({});
  });
});
