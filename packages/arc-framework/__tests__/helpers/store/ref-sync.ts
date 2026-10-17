/** Two independently configured ref stores sharing one real bare origin. */

import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { onTestFinished } from "vitest";
import { setupMultiClone } from "../multi-clone.js";
import { makeGitExec } from "../integration.js";
import { createRefStore } from "../../../src/lib/store/create.js";
import { createDefaultStorePorts, createRefLockFactory } from "../../../src/lib/store/default-ports.js";
import { createExecaRawGitExec } from "../../../src/lib/git/process-executor.js";
import type { RefStorePorts } from "../../../src/lib/store/ports.js";
import { createRefClock } from "./ref-clock.js";

export async function refSyncFixture(layout: "default" | "separate" = "default") {
  const config = { "arc.identity": "andrew", ...(layout === "default" ? { "remote.origin.arc-state": "push" } : {}) };
  const topology = await setupMultiClone({ cloneA: { config }, cloneB: { config } });
  onTestFinished(topology.cleanup);
  return { ...topology, a: await createRefSyncCheckout(topology.cloneA, layout, topology.origin), b: await createRefSyncCheckout(topology.cloneB, layout, topology.origin), remote: makeGitExec(topology.origin),
    remoteName: layout === "default" ? "origin" : "backing" };
}

/** Bind a further independently configured clone to the fixture's actual state repository. */
export async function createRefSyncCheckout(root: string, layout: "default" | "separate", origin: string) {
  const exec = makeGitExec(root), defaults = createDefaultStorePorts({ checkoutRoot: root, exec });
  const gitDir = layout === "separate" ? join(root, ".git", "arc", "store") : undefined;
  if (gitDir) {
    await exec("git", ["init", "--bare", "--ref-format=reftable", "--object-format=sha1", gitDir]);
    await exec("git", [`--git-dir=${gitDir}`, "remote", "add", "backing", origin]);
    await exec("git", [`--git-dir=${gitDir}`, "config", "remote.backing.arc-state", "push"]);
  }
  const actor = `andrew@${randomUUID()}`;
  const ports: RefStorePorts = { ...defaults, backingRepository: async () => null, ...createRefClock(), rawExec: createExecaRawGitExec(root),
    actor: async () => actor, random: () => 0.5, lock: createRefLockFactory(defaults) };
  const git = async (args: string[]) => {
    const directory = join(root, ".git", "arc", "store");
    let selected: string | undefined;
    try { await defaults.fs.lstat(directory); selected = directory; }
    catch (error) { if (!(typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT")) throw error; }
    return exec("git", [...selected ? [`--git-dir=${selected}`] : [], ...args]);
  };
  return { root, exec, git, gitDir, ports, store: createRefStore(ports) };
}
