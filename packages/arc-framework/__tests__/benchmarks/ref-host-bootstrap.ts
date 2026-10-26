/** Explicit single-registry continuation for manual probes of receivers without atomic publication. */
import assert from "node:assert/strict";
import type { createRefStore } from "../../src/lib/store/index.js";
import type { HostGit } from "./ref-host-transport.js";

/** Preserve the backend's multi-ref failure, then seed only the owned registry under an exact absence lease. */
export async function bootstrapHostRegistry(input: { git: HostGit; store: ReturnType<typeof createRefStore>;
  path: string; remote: string; owned: Map<string, string> }) {
  const { git, store, path, remote, owned } = input;
  const result = await store.push();
  assert.equal(result.status, "ok", JSON.stringify(result));
  if (result.status !== "ok") throw new Error("The multi-ref bootstrap trial was refused before publication");
  const held = result.result;
  assert(held.publishes.some(row => row.status === "failed" && JSON.stringify(row).includes("atomic")), JSON.stringify(held));
  const registry = "refs/arc/project/registry", personal = "refs/arc/user/andrew/personal";
  assert.equal((await git("single-registry-empty", path, ["ls-remote", "--refs", "--", remote, registry, personal])).trim(), "");
  const tip = (await git("single-registry-source", path, ["rev-parse", registry])).trim();
  await git("single-registry-bootstrap", path, ["push", "--porcelain", `--force-with-lease=${registry}:`, "--", remote, `${tip}:${registry}`]);
  owned.set(registry, tip);
  return { held, ref: registry, tip, limitation: "Receiver lacks atomic pushes; backend preserved all pending refs",
    continuation: "Operator seeded the project registry with an exact single-ref lease for the remaining single-ref trials" };
}
