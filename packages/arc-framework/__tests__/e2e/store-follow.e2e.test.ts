/** A real noninteractive follow copies and clears late publications on actual Git receivers. */
import { expect, it } from "vitest";
import { deletedFollowSource } from "../helpers/store/leave-source.js";
import { lateFollowFixture } from "../helpers/store/follow.js";
import { success } from "../helpers/store/suite-tools.js";
import { runArcNoTty } from "./helpers.js";
import { rename } from "node:fs/promises";
import { followAccountFixture, interruptFollowAccount } from "../helpers/store/follow-account.js";
import { MigrateReportSchema } from "../../src/lib/store/index.js";

it("keeps the real CLI's uncertain-copy inspection remedy usable after source off", async () => {
  const f = await followAccountFixture(); await interruptFollowAccount(f, "unknown");
  await rename(f.h.destinationDirectory, f.h.destinationDirectory + ".offline");
  let output: Awaited<ReturnType<typeof runArcNoTty>>;
  try { output = await runArcNoTty(["store", "remote", "origin", "off", "--json"], f.root); }
  finally { await rename(f.h.destinationDirectory + ".offline", f.h.destinationDirectory); }
  expect(output.exitCode, output.stdout + output.stderr).toBe(0);
  const result = JSON.parse(output.stdout) as { result: { report: unknown } };
  const report = MigrateReportSchema.parse(result.result.report);
  const notice = report.notices.find(row => row.condition.includes("could not be established"));
  const ref = /git show (\S+) /u.exec(notice?.remedy?.text ?? "")?.[1];
  expect(ref).toBeDefined();
  if (!ref) throw new Error("The command returned no inspection remedy");
  await expect(f.original.exec("git", ["show", ref], { cwd: f.root })).resolves.toMatchObject({ stdout: expect.stringContaining('"attempt"') });
}, 30_000);

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

it("leaves a deleted source without a terminal and carries its last published end to the destination", async () => {
  const h = await deletedFollowSource(), follower = h.follower;
  const blocked = await runArcNoTty(["store", "migrate", "--json"], follower.root);
  expect(JSON.parse(blocked.stdout)).toMatchObject({ status: "refused", refusal: { code: "store", refusal: {
    code: "unreachable", remedy: { text: expect.stringContaining("--leave-source") },
  } } });
  const left = await runArcNoTty(["store", "migrate", "--leave-source", "--to", h.destinationDirectory, "--json"], follower.root);
  expect(left.exitCode, left.stdout + left.stderr).toBe(0);
  expect(JSON.parse(left.stdout)).toMatchObject({ status: "ok", result: { notices: expect.arrayContaining([
    expect.objectContaining({ condition: expect.stringContaining(h.origin) }),
  ]) } });
  expect(success(await follower.store.read({ reference: h.lineage })).content).toBe(h.lateEnd);
  expect(await follower.store.read({ reference: h.created.reference })).toMatchObject({ status: "refused", refusal: { code: "not-found" } });
  expect(success(await follower.store.pull({ history: [h.history] })).states).toEqual([]);
  expect((await follower.exec("git", ["for-each-ref", "--format=%(refname)", "refs/arc/tmp/migrate/move"])).stdout).toBe("");
  expect((await follower.git(["remote", "get-url", "backing"])).stdout.trim()).toBe(h.destinationDirectory);
}, 60_000);
