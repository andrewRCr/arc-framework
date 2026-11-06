/** Observe kernel RSS only while a child is the intended native executable. */
import { readFileSync, readlinkSync } from "node:fs";

export interface PeakIO { readlink: (path: string) => string; readFile: (path: string) => string }
/** Observed native peak, retaining the last executable for an unavailable report. */
export interface PeakState { rssMiB?: number; observedExecutable?: string }
/** Labels and observations for a process's memory report. */
export interface PeakLine { check: string; shard?: string; softLimitMiB?: number; peak: PeakState; signal?: NodeJS.Signals | null }

const procIO: PeakIO = { readlink: readlinkSync, readFile: path => readFileSync(path, "utf8") };

/** Parse the kernel's KiB high-water mark to MiB. */
export function parsePeakMiB(text: string): number | undefined {
  const match = /^VmHWM:\s+(\d+)\s+kB$/m.exec(text);
  return match === null ? undefined : Number(match[1]) / 1024;
}

/** Take one sample only when its executable identity is stable across the status read. */
export function samplePeak(pid: number, expected: string, state: PeakState, io: PeakIO): PeakState {
  let observed = state;
  try {
    const executable = io.readlink(`/proc/${pid}/exe`);
    observed = { ...state, observedExecutable: executable };
    if (executable !== expected) return observed;
    const rssMiB = parsePeakMiB(io.readFile(`/proc/${pid}/status`));
    const after = io.readlink(`/proc/${pid}/exe`);
    if (after !== expected || rssMiB === undefined) return { ...observed, observedExecutable: after };
    return { ...observed, rssMiB: Math.max(state.rssMiB ?? 0, rssMiB) };
  } catch {
    // Disappearance at exit and platforms without procfs cannot supply another sample.
    return observed;
  }
}

/** Poll Linux procfs every 20 ms until the returned finalizer stops it. */
export function watchPeak(pid: number, expected: string, platform: string, io: PeakIO = procIO): () => PeakState {
  let state: PeakState = {};
  if (platform !== "linux") return () => state;
  let stopped = false;
  const poll = (): void => { state = samplePeak(pid, expected, state, io); };
  poll();
  const timer = setInterval(poll, 20);
  timer.unref();
  return () => {
    if (!stopped) {
      clearInterval(timer);
      poll();
      stopped = true;
    }
    return state;
  };
}

/** Format one process's terminal peak line, rounding RSS upward to a whole MiB. */
export function formatPeakLine(line: PeakLine): string {
  const { check, shard, softLimitMiB, peak } = line;
  const observed = peak.observedExecutable === undefined ? "" : ` (observed: ${peak.observedExecutable})`;
  const rss = peak.rssMiB === undefined ? `unavailable${observed}` : `${Math.ceil(peak.rssMiB)} MiB`;
  const signal = line.signal ? `; signal: ${line.signal}` : "";
  const limit = softLimitMiB === undefined ? "" : `; soft limit: ${softLimitMiB} MiB`;
  return `${check}${shard === undefined ? "" : ` [${shard}]`}: peak: ${rss}${signal}${limit}`;
}
