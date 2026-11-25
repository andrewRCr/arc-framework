/** Observe kernel RSS only while a child is the intended native executable. */
import { appendFileSync, readFileSync, readlinkSync } from "node:fs";

export interface PeakIO { readlink: (path: string) => string; readFile: (path: string) => string }
/** Observed native peak, retaining the last executable for an unavailable report. */
export interface PeakState { rssMiB?: number; observedExecutable?: string }
/** Terminal V8 heap observations, expressed in MiB. */
export interface NodeHeap { usedMiB: number; limitMiB: number }
/** Labels and observations for a process's memory report. */
export interface PeakLine { check: string; shard?: string; softLimitMiB?: number; peak: PeakState; signal?: NodeJS.Signals | null; heap?: NodeHeap | null }

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
  const cue = splitDue(line) ? "; due for a split" : "";
  return `${check}${shard === undefined ? "" : ` [${shard}]`}: peak: ${rss}${signal}${limit}${formatHeap(line.heap)}${cue}`;
}

/** Report a peak and append an advisory shard split cue to a configured CI summary. */
export function reportPeakLine(line: PeakLine, env: NodeJS.ProcessEnv, append: (file: string, text: string) => void = appendFileSync): string {
  const text = formatPeakLine(line);
  const summary = env.GITHUB_STEP_SUMMARY;
  if (summary && splitDue(line)) {
    try { append(summary, `${text}\n`); } catch {
      // The cue remains on stdout; advisory summary I/O never changes the check's status.
    }
  }
  return text;
}

function splitDue(line: PeakLine): boolean {
  return line.shard !== undefined && line.peak.rssMiB !== undefined && Math.ceil(line.peak.rssMiB) >= 2765;
}

function formatHeap(heap: NodeHeap | null | undefined): string {
  if (heap === undefined) return "";
  if (heap === null) return "; heap: unavailable";
  return `; heap in use: ${Math.ceil(heap.usedMiB)} MiB; heap limit: ${Math.ceil(heap.limitMiB)} MiB`;
}
