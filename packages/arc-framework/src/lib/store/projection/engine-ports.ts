/** Lazy host boundaries used only by a command whose store keeps state off branch. */
import type { GitExec, GitExecInput } from "../../git/exec.js";
import type { GitDirectoryFileAccess } from "../../git/directories.js";
import type { Slug } from "../../kernel/index.js";
import { NATIVE_LEASE_PROCESS } from "../../lease-process.js";
import { getOrCreateMachineId } from "../../user-sync/sync-state.js";
import { createDefaultStorePorts } from "../default-store-ports.js";
import type { AsideWriterInput } from "./aside.js";
import type { ProjectionLockDependencies } from "./lock.js";
import type { ProjectionWalkFs } from "./engine-walk.js";
import type { SwapHooks } from "./swap.js";

/** Git, filesystem, process identity, and optional fault injection for a command's engine. */
export interface ProjectionEnginePorts {
  readonly exec: GitExec;
  readonly execInput: GitExecInput;
  readonly fs: GitDirectoryFileAccess;
  readonly walkFs?: ProjectionWalkFs;
  readonly actor: (identity: Slug) => Promise<string>;
  readonly writer: () => Promise<AsideWriterInput>;
  readonly lock?: Partial<ProjectionLockDependencies>;
  readonly maxWaitMs?: number;
  readonly hooks?: SwapHooks;
}

/** Bind the native engine without performing I/O; callers resolve it after the capability gate. */
export function createProjectionEnginePorts(checkout: string): ProjectionEnginePorts {
  const ports = createDefaultStorePorts({ checkoutRoot: checkout });
  return { exec: ports.exec, execInput: ports.execInput, fs: ports.fs,
    actor: async (identity) => `${identity}@${await getOrCreateMachineId(checkout, {
      exec: ports.exec, readFile: path => ports.fs.readFile(path), writeFile: (path, content) => ports.fs.writeFile(path, content),
      mkdir: async (path, options) => { await ports.fs.mkdir(path, options); },
    }, identity, (path, content) => ports.fs.exclusiveCreate(path, content))}`,
    writer: async () => ({ pid: NATIVE_LEASE_PROCESS.pid, processInstance: NATIVE_LEASE_PROCESS.processInstance,
      processScope: await NATIVE_LEASE_PROCESS.resolveProcessScope() }),
  };
}
