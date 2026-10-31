/** A backing push setting re-homes its last captured publications after the old receiver disappears. */
import { expect, it } from "vitest";
import { deletedFollowSource } from "../helpers/store/leave-source.js";
import { success } from "../helpers/store/suite-tools.js";
import { runArcNoTty } from "./helpers.js";

it("repoints backing push through the CLI and carries an end published after the move's copy", async () => {
  const h = await deletedFollowSource("backing", "remote.copied"), follower = h.follower;
  const repointed = await runArcNoTty(["store", "remote", "backing", "push", "--json"], follower.root);
  expect(repointed.exitCode, repointed.stdout + repointed.stderr).toBe(0);
  expect(JSON.parse(repointed.stdout)).toMatchObject({ status: "ok", result: { remotes: expect.arrayContaining([
    expect.objectContaining({ name: "backing", role: "push", url: h.destinationDirectory }),
  ]) } });
  expect(success(await follower.store.read({ reference: h.lineage })).content).toBe(h.lateEnd);
  expect(await follower.store.read({ reference: h.created.reference })).toMatchObject({ status: "refused", refusal: { code: "not-found" } });
  expect(success(await follower.store.pull({ history: [h.history] })).states).toEqual([]);
  expect((await follower.exec("git", ["for-each-ref", "--format=%(refname)", "refs/arc/tmp/migrate/move"])).stdout).toBe("");
}, 60_000);
