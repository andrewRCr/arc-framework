import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { formatPeakLine, parsePeakMiB, reportPeakLine, samplePeak, watchPeak, type PeakIO } from "../../../../src/scripts/typecheck/peak.js";

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

it("retains the observed native executable when exit races the status read", () => {
  const state = samplePeak(12, native, {}, {
    readlink: () => native,
    readFile: () => { throw new Error("ENOENT"); },
  });
  expect(state).toEqual({ observedExecutable: native });
});

describe("shard split cues", () => {
  it.each([[2764, false], [2765, true], [2764.1, true]] as const)("uses the printed whole-MiB peak at %s", (rssMiB, marked) => {
    expect(formatPeakLine({ check: "typecheck:test", shard: "unit-a", peak: { rssMiB }, softLimitMiB: 6000 }).includes("due for a split"))
      .toBe(marked);
  });
  it("never marks the source program", () => {
    expect(formatPeakLine({ check: "typecheck", peak: { rssMiB: 9000 }, softLimitMiB: 6000 })).not.toContain("due for a split");
  });
  it("appends a marked line to the configured step summary", () => {
    const root = mkdtempSync(join(tmpdir(), "typecheck-summary-"));
    const file = join(root, "summary");
    writeFileSync(file, "Existing summary\n");
    try {
      const text = reportPeakLine({ check: "typecheck:test", shard: "unit-a", peak: { rssMiB: 2765 } }, { GITHUB_STEP_SUMMARY: file });
      expect(text).toContain("due for a split");
      expect(readFileSync(file, "utf8")).toBe(`Existing summary\n${text}\n`);
    } finally { rmSync(root, { recursive: true, force: true }); }
  });
  it("does not append an unmarked line", () => {
    const root = mkdtempSync(join(tmpdir(), "typecheck-summary-"));
    const file = join(root, "summary");
    try {
      reportPeakLine({ check: "typecheck:test", shard: "unit-a", peak: { rssMiB: 2764 } }, { GITHUB_STEP_SUMMARY: file });
      expect(existsSync(file)).toBe(false);
    } finally { rmSync(root, { recursive: true, force: true }); }
  });
  it("reports a marked line without a configured summary", () => {
    const root = mkdtempSync(join(tmpdir(), "typecheck-summary-"));
    try {
      expect(reportPeakLine({ check: "typecheck:test", shard: "unit-a", peak: { rssMiB: 2765 } }, {})).toContain("due for a split");
      expect(readdirSync(root)).toEqual([]);
    } finally { rmSync(root, { recursive: true, force: true }); }
  });
  it("keeps reporting when the advisory summary cannot be written", () => {
    expect(reportPeakLine({ check: "typecheck:test", shard: "unit-a", peak: { rssMiB: 2765 } }, { GITHUB_STEP_SUMMARY: "/summary" },
      () => { throw new Error("EIO"); })).toContain("due for a split");
  });
});
