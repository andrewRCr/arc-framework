import { join } from "node:path";
import { afterEach, expect, it } from "vitest";
import { readWorktreeMarker } from "../../src/lib/git/worktree-marker.js";
import { cleanupTempDir } from "../helpers/integration.js";
import { fixture, retirementFixtureRoots } from "../helpers/store/projection-retirement.js";

afterEach(async () => {
  for (const root of retirementFixtureRoots.splice(0)) await cleanupTempDir(root);
});

it("preserves origin/main when teardown refuses a markerless linked checkout", async () => {
  const h = await fixture({ end: "archive" });
  const checkout = join(h.root, "checkout");
  await h.exec("git", ["switch", "main"]);
  await h.exec("git", ["worktree", "add", checkout, "feat/demo"]);
  h.ctx.locusPorts = undefined;
  h.ctx.readMarker = readWorktreeMarker;

  // Advance main on the bare origin without refreshing the checkout's tracking ref.
  await h.exec("git", ["--git-dir", join(h.root, "origin.git"), "update-ref", "refs/heads/main", h.workOid, h.baseOid]);
  const trackingRef = "refs/remotes/origin/main";
  expect(await h.local(trackingRef)).toBe(h.baseOid);

  await expect(h.teardown()).rejects.toThrow("no ARC ownership marker");
  expect(await h.local(trackingRef), "origin/main after markerless refusal").toBe(h.baseOid);

  await h.exec("git", ["switch", "--detach"], { cwd: checkout });
  await expect(h.teardown()).resolves.toMatchObject({ branchDeleted: true, remoteBranchDeleted: true });
  expect(await h.local(trackingRef)).toBe(h.workOid);
});
