/** Compensation requires the exact owned spawn generation, including its original bytes. */
import { afterEach, expect, it } from "vitest";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { claimSpawnedWorktree, requireSpawnedWorktreeClaim, removeDisposableSpawn } from "../../../src/lib/work-unit/spawned-worktree-claim.js";
import { resolveWorktreeMarkerPath } from "../../../src/lib/git/worktree-marker.js";
import { createRefStore } from "../../../src/lib/store/create.js";
import { createDefaultRefStorePorts } from "../../../src/lib/store/default-ports.js";
import { workItemArtifactPath } from "../../../src/lib/store/lifecycle-storage.js";
import { beginProjectionCommand } from "../../../src/lib/store/projection/process-state.js";
import { scriptGitExec } from "../../helpers/git-exec-fake.js";

let path: string | undefined;
afterEach(async () => { if (path !== undefined) await rm(path, { recursive: true, force: true }); path = undefined; beginProjectionCommand(); });

it.each(["no-receipt", "absent", "malformed", "reformatted", "external"] as const)("refuses compensation with %s ownership evidence", async (kind) => {
  path = await mkdtemp(join(tmpdir(), "spawn-claim-"));
  const expected = await claimSpawnedWorktree(path, { wuName: "demo", spawningIdentity: "starter", now: 0 });
  const markerPath = resolveWorktreeMarkerPath(path);
  if (kind === "absent") await rm(markerPath);
  if (kind === "malformed") await writeFile(markerPath, "invalid marker");
  if (kind === "reformatted") await writeFile(markerPath, JSON.stringify(JSON.parse(expected.toString())));
  if (kind === "external") await writeFile(markerPath, JSON.stringify({ ...JSON.parse(expected.toString()), spawnedByArc: false }));
  const before = await readFile(markerPath).catch(() => null);
  await expect(requireSpawnedWorktreeClaim(path, kind === "no-receipt" ? undefined : expected)).rejects.toThrow("ownership marker generation");
  expect(await readFile(markerPath).catch(() => null)).toEqual(before);
});

it("restores the cached claim after a failed spawn removal puts its original marker back", async () => {
  path = await mkdtemp(join(tmpdir(), "spawn-claim-layout-"));
  const root = path, head = "a".repeat(40), branch = "feat/demo";
  const markerGeneration = await claimSpawnedWorktree(root, { wuName: "demo", spawningIdentity: "andrew", now: 0,
    holder: { kind: "owner", uid: "00000000-0000-4000-8000-000000000001", names: { current: "demo", former: [] } } });
  createRefStore(createDefaultRefStorePorts({ checkoutRoot: root, backingRepository: async () => null }));
  expect(await workItemArtifactPath(root, "demo", "meta", { kind: "active" }, null)).toBe(".arc/active/current/meta-demo.md");
  const fake = scriptGitExec([
    { match: ["rev-parse", "--verify", "HEAD"], responses: [{ stdout: head }] },
    { match: ["symbolic-ref", "--quiet", "HEAD"], responses: [{ stdout: branch }] },
    { match: ["worktree", "remove", root], responses: [async () => {
      expect(await workItemArtifactPath(root, "demo", "meta", { kind: "active" }, null)).toBe(".arc/active/in-flight/demo/meta-demo.md");
      return { failure: { exitCode: 1, stderr: "Checkout could not be removed" } };
    }] },
  ]);
  await expect(removeDisposableSpawn({ exec: fake.exec, path: root, markerGeneration, coordinate: { head, branch } }))
    .rejects.toThrow("could not prove the checkout disposable");
  expect(await readFile(resolveWorktreeMarkerPath(root))).toEqual(markerGeneration);
  expect(await workItemArtifactPath(root, "demo", "meta", { kind: "active" }, null)).toBe(".arc/active/current/meta-demo.md");
});
