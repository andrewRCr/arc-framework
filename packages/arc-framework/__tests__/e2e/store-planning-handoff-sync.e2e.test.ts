/** Handoff sync in the detached Planning checkout created by a full-protection start. */
import { chmod, readFile, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { expect, it } from "vitest";

import { parseMetaRecord } from "../../src/lib/active/meta-reader.js";
import { git, runArcWithStdin } from "./helpers.js";
import {
  expectLifecycleResult, lifecycleRepository, LIFECYCLE_TIMEOUT_MS, readLifecycleMeta,
} from "../helpers/store-lifecycle-fixture.js";

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

it("checks the stored Owner for handover confirmation when the sender has a pending meta edit", async () => {
  const h = await lifecycleRepository({ remote: true });
  const slug = "design";
  const sender = h.checkoutPath(slug);
  const recipient = "next-owner";
  const successor = "later-owner";
  await git(h.repo, ["config", "arc.pushInterlock", "on-workflow"]);
  expectLifecycleResult(await h.run(["start", slug, "--new"]), 0, /design/u);
  expectLifecycleResult(await h.run(["handover", slug, "--to", recipient], sender), 0, /Handed design/u);
  const publish = await h.run(["sync", "--json"], sender);
  expect(publish.exitCode, publish.output).toBe(0);
  expect(JSON.parse(publish.stdout)).toMatchObject({ state: { push: { result: "success" } } });

  const path = await h.run(["view", "meta", "--for", slug, "--path"], sender);
  expect(path.exitCode, path.output).toBe(0);
  const meta = path.stdout.trim();
  const published = await readFile(meta, "utf8");
  expect(parseMetaRecord(published).owner).toBe(recipient);
  // Windows requires write permission on the destination even for an atomic replacement.
  const pending = `${published.trimEnd()}\n\nPending sender edit.\n`;
  await writeFile(`${meta}.tmp`, pending);
  await chmod(meta, 0o600);
  await rename(`${meta}.tmp`, meta);

  const other = h.checkoutPath("recipient");
  await git(h.repo, ["clone", h.origin, other]);
  await git(other, ["config", "arc.identity", recipient]);
  await git(other, ["config", "user.name", "Recipient"]);
  await git(other, ["config", "user.email", "recipient@example.test"]);
  await git(other, ["config", "arc.pushInterlock", "on-workflow"]);
  expectLifecycleResult(await h.run(["store", "remote", "origin", "push"], other), 0, /origin/u);
  expectLifecycleResult(await h.run(["sync", "--json"], other), 0, /"state"/u);
  expectLifecycleResult(await h.run(["handover", slug, "--to", successor], other), 0, /Handed design/u);
  const onward = await h.run(["sync", "--json"], other);
  expect(onward.exitCode, onward.output).toBe(0);
  expect(JSON.parse(onward.stdout)).toMatchObject({ state: { push: { result: "success" } } });

  const retry = await h.run(["sync", "--json"], sender);
  expect(retry.exitCode, retry.output).toBe(0);
  expect(JSON.parse(retry.stdout)).toMatchObject({ state: { pull: { result: "success" }, push: { result: "noop" } } });
  expect(await readFile(meta, "utf8")).toBe(pending);
  expect(await readLifecycleMeta(h.repo, slug)).toMatchObject({ fields: { owner: successor }, conflicts: [] });

  const workflow = await readFile(join(sender, ".arc/system/workflows/arc/session-lifecycle/session-handoff.md"), "utf8");
  const handover = workflow.split("**Person-to-person handoff:**")[1]?.split(/\r?\n\r?\n/u)[0] ?? "";
  const command = handover.match(/`noop`[^.]*`arc ([^`]+)`/u)?.[1];
  if (command === undefined) throw new Error("Missing handover confirmation read after sync");
  const args = command.replace("<slug>", slug).split(/\s+/u);
  const confirmation = await h.run(args, sender);
  expect(confirmation.exitCode, confirmation.output).toBe(0);
  const owner = args.includes("--json") ? (JSON.parse(confirmation.stdout) as { owner: unknown }).owner
    : parseMetaRecord(confirmation.stdout).owner;
  expect(owner, "the published Owner has moved on, so the sender cannot confirm the original recipient").toBe(successor);
  expect(await readFile(meta, "utf8")).toBe(pending);
}, LIFECYCLE_TIMEOUT_MS);
