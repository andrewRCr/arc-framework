/** Production dependency binding with lazy identity, remote, and write-lock resolution. */
import { setTimeout as delay } from "node:timers/promises";
import { dirname, join } from "node:path";
import type { GitExec, GitExecInput } from "../git/exec.js";
import { createExecaRawGitExec } from "../git/process-executor.js";
import { acquireAdvisoryLock, releaseAdvisoryLock } from "../advisory-lock.js";
import { readGitDirectories } from "../git/directories.js";
import type { RefStorePorts } from "./ports.js";
import { createDefaultStorePorts } from "./default-store-ports.js";
import { getOrCreateMachineId } from "../user-sync/sync-state.js";
import { createKindRegistry } from "./registry.js";
import { PRODUCTION_REGISTRATIONS } from "./kinds/registrations.js";

export { createDefaultStorePorts, configuredStateRemote } from "./default-store-ports.js";

/** Bind native ref-store dependencies while leaving the checkout's configuration at the caller. */
export function createDefaultRefStorePorts(input: { checkoutRoot: string; exec?: GitExec; execInput?: GitExecInput;
  backingRepository: RefStorePorts["backingRepository"]; writeBackingRepository?: RefStorePorts["writeBackingRepository"] }): RefStorePorts {
  const defaults = createDefaultStorePorts(input);
  return { ...defaults, backingRepository: input.backingRepository, ...input.writeBackingRepository ? { writeBackingRepository: input.writeBackingRepository } : {},
    rawExec: createExecaRawGitExec(input.checkoutRoot), sleep: { wait: signalEndedSleep, bound: signalEndedSleep },
    random: Math.random, registry: createKindRegistry(PRODUCTION_REGISTRATIONS), migrateStep: async () => {},
    actor: async (identity) => {
      const id = await getOrCreateMachineId(input.checkoutRoot, {
        readFile: (path) => defaults.fs.readFile(path), writeFile: (path, content) => defaults.fs.writeFile(path, content), exec: defaults.exec,
        mkdir: async (path, options) => { await defaults.fs.mkdir(path, options); },
      }, identity, (path, content) => defaults.fs.exclusiveCreate(path, content));
      return `${identity}@${id}`;
    }, lock: createRefLockFactory(defaults),
  };
}

async function signalEndedSleep(milliseconds: number, signal: AbortSignal): Promise<void> {
  try { await delay(milliseconds, undefined, { signal }); }
  catch (error) { if (!signal.aborted) throw error; }
}

/** Bind the per-ref advisory lock factory without reading checkout topology until acquisition. */
export function createRefLockFactory(input: Pick<RefStorePorts, "checkoutRoot" | "fs">): RefStorePorts["lock"] {
  return async (ref, waitMs) => {
    const { commonDir } = await readGitDirectories(input.checkoutRoot, input.fs);
    const path = join(commonDir, "arc", "locks", `${ref}.lock`);
    await input.fs.mkdir(dirname(path), { recursive: true });
    const options = { maxWaitMs: waitMs,
      exclusiveCreate: (path: string, content: string) => input.fs.exclusiveCreate(path, content),
      readFile: (path: string) => input.fs.readFile(path), removeFile: (path: string) => input.fs.unlink(path) };
    const handle = await acquireAdvisoryLock(path, options);
    return () => releaseAdvisoryLock(handle, options);
  };
}
