/** Resolved pure dependencies shared by ref backend operations. */

import type { GitExecOptions, GitExecInput, RawGitExec } from "../../git/exec.js";
import { withGitVersionFloor } from "../../git/version-floor.js";
import type { RefStorePorts } from "../ports.js";
import { createKindRegistry } from "../registry.js";
import { parseProjectIdentity } from "./project-identity.js";
import { validateRefAnchors } from "./anchor-registry.js";
import { PRODUCTION_REGISTRATIONS } from "../kinds/registrations.js";

/** Backend ports with a complete kind registry and failure-time executor checks. */
export interface RefBackendContext extends RefStorePorts {
  registry: NonNullable<RefStorePorts["registry"]>;
  /** One operation's selected repository; absence leaves selection lazy. */
  repository?: { commonDir: string; gitDir: string | null };
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
      (await ports.exec(command, ["--version"], options)).stdout),
    execInput: withGitVersionFloor(ports.execInput,
      async (_args, _input, options?: Parameters<GitExecInput>[2]) => ports.execInput(["--version"], "", options)),
    rawExec: withGitVersionFloor(ports.rawExec, async (_args, options?: Parameters<RawGitExec>[1]) =>
      new TextDecoder().decode((await ports.rawExec(["--version"], { ...options, input: undefined })).stdout)),
  };
}
