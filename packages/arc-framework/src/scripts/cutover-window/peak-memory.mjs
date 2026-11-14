/** Preload that records, at exit, the process's peak resident memory and the memory bounds it ran under. */
import { readFileSync, writeFileSync } from "node:fs";
import process from "node:process";
import v8 from "node:v8";

const target = process.env.ARC_PEAK_MEMORY_FILE;
delete process.env.ARC_PEAK_MEMORY_FILE;

/** The soft address-space limit in MiB, "unlimited", or null where the platform does not expose it. */
function addressSpaceLimitMiB() {
  try {
    const line = readFileSync("/proc/self/limits", "utf8").split("\n").find(row => row.startsWith("Max address space"));
    const soft = line?.slice("Max address space".length).trim().split(/\s+/u)[0];
    if (soft === undefined) return null;
    return soft === "unlimited" ? "unlimited" : Math.round(Number(soft) / 1048576);
  } catch {
    return null;
  }
}

if (target) {
  process.on("exit", () => {
    writeFileSync(target, JSON.stringify({ pid: process.pid, maxRssKiB: process.resourceUsage().maxRSS,
      addressSpaceLimitMiB: addressSpaceLimitMiB(), heapLimitMiB: Math.round(v8.getHeapStatistics().heap_size_limit / 1048576) }));
  });
}
