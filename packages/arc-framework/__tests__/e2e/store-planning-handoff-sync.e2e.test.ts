/** Handoff sync in the detached Planning checkout created by a full-protection start. */
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { expect, it } from "vitest";

import { git, runArcWithStdin } from "./helpers.js";
import { expectLifecycleResult, lifecycleRepository, LIFECYCLE_TIMEOUT_MS } from "../helpers/store-lifecycle-fixture.js";

it.each([
  { position: "at the base tip", visibleStash: false, detachedCommit: false, expectedExit: 0 },
  { position: "at the base tip with a visible stash", visibleStash: true, detachedCommit: false, expectedExit: 0 },
  { position: "with an extra detached commit", visibleStash: false, detachedCommit: true, expectedExit: 1 },
])("publishes a Planning handoff $position and reports whether code needs recovery", async ({ visibleStash, detachedCommit, expectedExit }) => {
  const h = await lifecycleRepository({ remote: true });
  await git(h.repo, ["config", "arc.syncInterlock", "on-handoff"]);
  await git(h.repo, ["config", "arc.pushInterlock", "on-workflow"]);
  if (visibleStash) {
    await git(h.repo, ["config", "status.showStash", "true"]);
    await writeFile(join(h.repo, "stashed-change.txt"), "Stashed work\n");
    await git(h.repo, ["stash", "push", "--include-untracked", "--", "stashed-change.txt"]);
  }
  const checkout = h.checkoutPath("design");
  expectLifecycleResult(await h.run(["start", "design", "--new"]), 0, /design/u);
  expect(await git(checkout, ["branch", "--show-current"])).toBe("");
  expect(await git(checkout, ["rev-parse", "HEAD"])).toBe(h.base);
  if (detachedCommit) await git(checkout, ["commit", "--allow-empty", "-m", "Detached work"]);
  const head = await git(checkout, ["rev-parse", "HEAD"]);

  const request = {
    schemaVersion: 1,
    sessionType: "planning",
    sessionContext: "Draft in progress.",
    nextAction: "Finish the design.",
  };
  const handoff = await runArcWithStdin(["handoff", "write", "-"], checkout, JSON.stringify(request));
  expect(handoff.exitCode, handoff.stderr).toBe(0);
  expect(JSON.parse(handoff.stdout)).toMatchObject({ status: "written", commitAtHandoff: head });
  expect(await git(checkout, ["status", "--porcelain"])).toBe("");
  if (visibleStash) {
    expect(await git(checkout, ["status", "--porcelain=v2", "--branch"])).toMatch(/^# stash 1$/mu);
  }

  const sync = await h.run(["sync", "--json"], checkout);
  expect(JSON.parse(sync.stdout)).toMatchObject({ state: { push: { result: "success" } } });
  const workRefs = ["for-each-ref", "--format=%(refname) %(objectname)", "refs/arc/work/"];
  const published = await git(h.origin, workRefs);
  expect(published).toContain("refs/arc/work/");
  expect(published).toBe(await git(checkout, workRefs));
  expect(await git(checkout, ["rev-parse", "HEAD"])).toBe(head);
  expect(await git(checkout, ["branch", "--show-current"])).toBe("");
  expect(await git(checkout, ["show-ref", "--heads"])).toBe(`${h.base} refs/heads/main`);
  expect(sync.exitCode, sync.output).toBe(expectedExit);
  expect(JSON.parse(sync.stdout)).toMatchObject({
    worktree: { action: "skip", result: detachedCommit ? "blocked" : "noop" },
  });
  if (detachedCommit) {
    expect(sync.output).toMatch(/(?:check out|create|switch to) a branch|git (?:branch|switch|checkout)/iu);
    await git(checkout, ["switch", "-c", "keep-design"]);
    const retry = await h.run(["sync", "--json"], checkout);
    expect(retry.exitCode, retry.stderr.trim()).toBe(0);
    expect(await git(h.origin, ["rev-parse", "refs/heads/keep-design"])).toBe(head);
  }
}, LIFECYCLE_TIMEOUT_MS);

it.each(["unclaimed", "dirty Planning"])("keeps the branch leg blocked for a detached %s checkout", async (kind) => {
  const h = await lifecycleRepository({ remote: true });
  await git(h.repo, ["config", "arc.pushInterlock", "on-workflow"]);
  const checkout = kind === "unclaimed" ? h.repo : h.checkoutPath("design");
  if (kind === "unclaimed") {
    await git(checkout, ["switch", "--detach", h.base]);
  } else {
    expectLifecycleResult(await h.run(["start", "design", "--new"]), 0, /design/u);
    await writeFile(join(checkout, "local-change.txt"), "Uncommitted work\n");
  }
  const sync = await h.run(["sync", "--json"], checkout);
  expect(sync.exitCode, sync.stderr.trim()).toBe(1);
  expect(JSON.parse(sync.stdout)).toMatchObject({ worktree: { result: "blocked", detail: "detached-head" } });
}, LIFECYCLE_TIMEOUT_MS);
