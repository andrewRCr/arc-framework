/** A real noninteractive follow copies and clears late publications on actual Git receivers. */
import { expect, it } from "vitest";
import { lateFollowFixture } from "../helpers/store/follow.js";
import { success } from "../helpers/store/suite-tools.js";
import { runArcNoTty } from "./helpers.js";

it("asks without a terminal and executes the explicit follow answer through the CLI", async () => {
  const h = await lateFollowFixture(), follower = h.follower;
  const question = await runArcNoTty(["store", "migrate", "--json"], follower.root);
  expect(JSON.parse(question.stdout)).toMatchObject({ status: "designation-needed", remote: "backing" });
  expect((await follower.exec("git", ["config", "remote.origin.arc-state"])).stdout.trim()).toBe("push");
  const followed = await runArcNoTty(["store", "remote", "backing", "push", "--json"], follower.root);
  expect(followed.exitCode, followed.stdout + followed.stderr).toBe(0);
  expect(JSON.parse(followed.stdout)).toMatchObject({ status: "ok", result: { layout: "separate" } });
  expect((await h.remote("git", ["for-each-ref", "--format=%(refname)", "refs/arc/"])).stdout.trim()).toBe("refs/arc/project/moved");
  expect((await h.a.exec("git", [`--git-dir=${h.destinationDirectory}`, "grep", "-F", "Prepared late publication.", "refs/arc/user/beth/personal"])).stdout).toContain("Prepared late publication.");
  expect(success(await follower.store.read({ reference: follower.unpublished })).content).toBe("Unpublished follower data.\n");
}, 60_000);
