/** Production dependency binding with lazy identity, remote, and write-lock resolution. */
import { setTimeout as delay } from "node:timers/promises";
import { dirname, join } from "node:path";
import type { GitExec, GitExecInput } from "../git/exec.js";
import { createExecaGitExec, createExecaGitExecInput, createExecaRawGitExec } from "../git/process-executor.js";
import { createGitFloorGate, gateGitExecutors, type GitFloorGate } from "../git/version-floor.js";
import { acquireAdvisoryLock, releaseAdvisoryLock, DEFAULT_MAX_WAIT_MS } from "../advisory-lock.js";
import { createStoreCheckoutLocation, readStoreGitDirectories } from "./checkout-location.js";
import type { RefStorePorts, StoreFileAccess } from "./ports.js";
import { createDefaultStorePorts, layerStoreFiles } from "./default-store-ports.js";
import { getOrCreateMachineIdAtCommonDir } from "../user-sync/sync-state.js";
import { createKindRegistry } from "./registry.js";
import { PRODUCTION_REGISTRATIONS } from "./kinds/registrations.js";

export { createDefaultStorePorts, configuredStateRemote } from "./default-store-ports.js";

// Native executors keep the process's PATH, so their Git-floor answers hold for the whole process.
const processGitFloor = createGitFloorGate();

/** Bind native ref-store dependencies while leaving the checkout's configuration at the caller.
 * @param input - Checkout, lazy backing pointer, optional already-bound Git adapters and file access, and an optional
 *   floor gate. Without one, injected adapters get answers of their own, apart from the process's native answers. File
 *   access a caller supplies replaces the native operations it names, for the ports and for finding the repository.
 * @returns Store ports whose Git executors each refuse a Git below the supported floor before their first call runs.
 */
export function createDefaultRefStorePorts(input: { checkoutRoot: string; exec?: GitExec; execInput?: GitExecInput;
  fs?: StoreFileAccess; backingRepository: RefStorePorts["backingRepository"];
  writeBackingRepository?: RefStorePorts["writeBackingRepository"]; gitFloor?: GitFloorGate }): RefStorePorts {
  const injected = input.exec !== undefined || input.execInput !== undefined;
  const git = gateGitExecutors(input.gitFloor ?? (injected ? createGitFloorGate() : processGitFloor), {
    exec: input.exec ?? createExecaGitExec(), execInput: input.execInput ?? createExecaGitExecInput(),
    rawExec: createExecaRawGitExec(input.checkoutRoot) });
  // One location serves every executor, so all of them leave a removed checkout for the primary together.
  const files = layerStoreFiles(input.fs);
  const location = createStoreCheckoutLocation({ checkoutRoot: input.checkoutRoot, exec: git.exec, fs: files });
  // Identity, remote, and actor resolution read Git through these ports too, so they pass the same gate.
  const defaults = createDefaultStorePorts({ ...input, exec: git.exec, execInput: git.execInput, fs: files, location });
  const rawExec: RefStorePorts["rawExec"] = async (args, options) =>
    git.rawExec(args, { ...options, cwd: await location.workingDirectory(options?.cwd ?? input.checkoutRoot) });
  return { ...defaults, rawExec, backingRepository: input.backingRepository, ...input.writeBackingRepository ? { writeBackingRepository: input.writeBackingRepository } : {},
    sleep: { wait: signalEndedSleep, bound: signalEndedSleep },
    random: Math.random, registry: createKindRegistry(PRODUCTION_REGISTRATIONS), migrateStep: async () => {},
    actor: async (identity) => {
      // The located common directory, not one Git reports relative to wherever it ran, after a removed checkout.
      const id = await getOrCreateMachineIdAtCommonDir(input.checkoutRoot, (await location.gitDirectories()).commonDir, {
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
export function createRefLockFactory(input: Pick<RefStorePorts, "checkoutRoot" | "fs" | "gitDirectories">): RefStorePorts["lock"] {
  return async (ref, waitMs) => {
    const { commonDir } = await readStoreGitDirectories(input);
    const path = join(commonDir, "arc", "locks", `${ref}.lock`);
    await input.fs.mkdir(dirname(path), { recursive: true });
    const options = { maxWaitMs: waitMs,
      exclusiveCreate: (path: string, content: string) => input.fs.exclusiveCreate(path, content),
      readFile: (path: string) => input.fs.readFile(path), removeFile: (path: string) => input.fs.unlink(path) };
    const handle = await acquireAdvisoryLock(path, options);
    return () => releaseAdvisoryLock(handle, waitMs === 0 ? { ...options, maxWaitMs: DEFAULT_MAX_WAIT_MS } : options);
  };
}
