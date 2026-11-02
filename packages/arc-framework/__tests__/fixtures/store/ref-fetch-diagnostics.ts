/** Opt-in per-process evidence for the temporary hosted fetch reproduction. */
import { channel } from "node:diagnostics_channel";
import { closeSync, mkdirSync, openSync, writeSync } from "node:fs";
import { lstat, readFile, realpath, stat } from "node:fs/promises";
import { join } from "node:path";
import { readGitDirectories } from "../../../src/lib/git/directories.js";

/** Resolve physical identity before the writer's READY barrier and retain every phase immediately. */
export async function installRefFetchDiagnostics(root: string, role: unknown): Promise<void> {
  const directory = process.env.ARC_REF_FETCH_DIAGNOSTICS;
  if (!directory) return;
  mkdirSync(directory, { recursive: true });
  const fd = openSync(join(directory, `fetch-${process.pid}.jsonl`), "wx");
  const emit = (event: unknown) => { writeSync(fd, `${JSON.stringify(event)}\n`); };
  const directories = await readGitDirectories(root, { lstat, realpath, readFile: path => readFile(path, "utf8") });
  const commonDir = await realpath(directories.commonDir), physical = await stat(commonDir);
  emit({ phase: "process", pid: process.pid, root, role, directories, physical: { commonDir, dev: physical.dev, ino: physical.ino },
    at: new Date().toISOString(), node: process.version, platform: process.platform });
  channel("arc.diagnostic.ref-fetch").subscribe(emit);
  process.on("uncaughtExceptionMonitor", error => emit({ phase: "uncaught", message: error.message, stack: error.stack }));
  process.on("exit", code => { emit({ phase: "exit", code }); closeSync(fd); });
}
