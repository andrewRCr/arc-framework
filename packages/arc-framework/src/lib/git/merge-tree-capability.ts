/** Shared capability probe for Git's write-tree merge forms. */

import type { RawGitExec } from "../change-facts.js";

/** Typed refusal shared by consumers that require in-core merge-tree support. */
export type MergeTreeCapabilityRefusalReason = "merge-tree-write-tree-unsupported";

const objectId = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/u;
const decoder = new TextDecoder("utf-8", { fatal: true });
const capabilityByExec = new WeakMap<RawGitExec, Promise<boolean>>();

function decodeObjectId(bytes: Uint8Array): string | null {
  try {
    const value = decoder.decode(bytes).trim();
    return objectId.test(value) ? value : null;
  } catch {
    return null;
  }
}

async function resolveCanary(exec: RawGitExec): Promise<string | null> {
  try {
    const result = await exec(["rev-parse", "--verify", "HEAD^{commit}"], {
      objectAccess: "local-only",
    });
    return decodeObjectId(result.stdout);
  } catch {
    return null;
  }
}

async function probeMergeTreeWriteTree(exec: RawGitExec): Promise<boolean> {
  const canary = await resolveCanary(exec);
  if (canary === null) {
    capabilityByExec.delete(exec);
    return false;
  }
  try {
    const [writeTree, explicitBase] = await Promise.all([
      exec(["merge-tree", "--write-tree", canary, canary], { objectAccess: "local-only" }),
      exec([
        "merge-tree", "--write-tree", "--merge-base", canary, canary, canary,
      ], { objectAccess: "local-only" }),
    ]);
    return decodeObjectId(writeTree.stdout) !== null && decodeObjectId(explicitBase.stdout) !== null;
  } catch {
    return false;
  }
}

/** Establish whether one Git execution boundary supports the required merge-tree forms. */
export function supportsMergeTreeWriteTree(exec: RawGitExec): Promise<boolean> {
  const cached = capabilityByExec.get(exec);
  if (cached !== undefined) return cached;
  const pending = probeMergeTreeWriteTree(exec);
  capabilityByExec.set(exec, pending);
  return pending;
}
