/** Resolved pure dependencies shared by ref backend operations. */

import type { GitBatchReadScope } from "../../git/batch-reader.js";
import type { GitExecOptions, GitExecInput, RawGitExec } from "../../git/exec.js";
import { withGitVersionFloor } from "../../git/version-floor.js";
import type { RefStorePorts } from "../ports.js";
import { createKindRegistry } from "../registry.js";
import { parseProjectIdentity } from "./project-identity.js";
import { validateRefAnchors } from "./anchor-registry.js";
import { PRODUCTION_REGISTRATIONS } from "../kinds/registrations.js";
import type { ObjectFormat } from "./manifest.js";
import type { BatchObject, ListedTree } from "./batch-read.js";
import type { LifecycleEvidence } from "./sync-lifecycle-evidence.js";
import type { RefOperationScope } from "./operation-scope.js";

/** Backend ports with a complete kind registry and failure-time executor checks. */
export interface RefBackendContext extends RefStorePorts {
  registry: NonNullable<RefStorePorts["registry"]>;
  /** Logical state is acquired under this remote root; manifest retention remains machine-local. */
  readSource?: { root: string; versionRef: string };
  /** One operation's selected repository; absence leaves selection lazy. */
  repository?: { commonDir: string; gitDir: string | null; source: RefBackendContext };
  /** Prospective blobs stay readable in memory until their commit owns the layout lock. */
  blobStage?: { format: ObjectFormat; blobs: Map<string, Uint8Array> };
  /** Native object readers belong to one public read or mutation call. */
  batchReader?: GitBatchReadScope;
  /** Readers and remembered lookups belong to this public operation. */
  operationScope?: RefOperationScope;
  /** Successful immutable evidence belongs to one repository-bound write or sync attempt. */
  writeEvidence?: { objects: Map<string, BatchObject>; trees: Map<string, ListedTree>; format?: ObjectFormat };
  /** Decoded quarters and raw reachability are local to the selected repository's sync operation. */
  lifecycleEvidence?: LifecycleEvidence;
  /** A push and all its nested pulls share one cancellation bound. */
  syncDeadline?: { signal: AbortSignal; end: number; cleanup: RefBackendContext; operation: "pull" | "push" };
}

/** Bind failure-time checks and pure defaults without invoking any dependency. */
export function createRefBackendContext(ports: RefStorePorts): RefBackendContext {
  const registered = ports.registry ?? createKindRegistry(PRODUCTION_REGISTRATIONS);
  const identity = registered["project-registry/identity"];
  const registry = { ...registered, "project-registry/identity": { ...identity, parser: identity.parser ?? ((content: string) => {
    const data = parseProjectIdentity(content);
    return data ? { success: true as const, data } : { success: false as const, error: "Invalid project identity" };
  }) } };
  validateRefAnchors(registry);
  return {
    ...ports, registry,
    exec: withGitVersionFloor(ports.exec, async (command, _args, options?: GitExecOptions) =>
      (await ports.exec(command, ["--version"], probeControls(options))).stdout),
    execInput: withGitVersionFloor(ports.execInput,
      async (_args, _input, options?: Parameters<GitExecInput>[2]) => ports.execInput(["--version"], "", probeControls(options))),
    rawExec: withGitVersionFloor(ports.rawExec, async (_args, options?: Parameters<RawGitExec>[1]) =>
      new TextDecoder().decode((await ports.rawExec(["--version"], probeControls(options))).stdout)),
  };
}

/** The failing call's directory and cancellation alone: its object-access guard is an option an older Git rejects. */
function probeControls(options?: { cwd?: string; signal?: AbortSignal }): { cwd?: string; signal?: AbortSignal } {
  return { cwd: options?.cwd, signal: options?.signal };
}
