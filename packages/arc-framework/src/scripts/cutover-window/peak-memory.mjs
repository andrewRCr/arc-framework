/** Preload that records the process's peak resident memory, in KiB, to a named file when it exits. */
import { writeFileSync } from "node:fs";
import process from "node:process";

const target = process.env.ARC_PEAK_MEMORY_FILE;
delete process.env.ARC_PEAK_MEMORY_FILE;
if (target) {
  process.on("exit", () => {
    writeFileSync(target, JSON.stringify({ pid: process.pid, maxRssKiB: process.resourceUsage().maxRSS }));
  });
}
