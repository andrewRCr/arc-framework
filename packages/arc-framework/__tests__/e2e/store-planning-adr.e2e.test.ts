/** Planning stays detached until activation gives the accepted ADR a work branch. */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { expect, it } from "vitest";

import type { SessionInitProbeResult } from "../../src/commands/status/types.js";
import { parseMetaRecord, setMetaBulletFields } from "../../src/lib/active/meta-reader.js";
import { selectStore } from "../../src/lib/store/create.js";
import { createDefaultStorePorts } from "../../src/lib/store/default-ports.js";
import { readProjectIdentityBinding } from "../../src/lib/store/project-identity.js";
import { lifecycleRepository, LIFECYCLE_IDENTITY, LIFECYCLE_TIMEOUT_MS, readLifecycleMeta } from "../helpers/store-lifecycle-fixture.js";
import { seedStore } from "../helpers/store/seed-store.js";
import { git } from "./helpers.js";

it.each(["new", "renamed"])("resumes activation on a %s branch by committing its accepted ADR", async branchKind => {
  const h = await lifecycleRepository({ protection: "full", remote: true });
  const slug = "search-model";
  const checkout = h.checkoutPath(slug);
  const started = await h.run(["start", slug, "--new", "--yes"]);
  expect(started.exitCode, started.output).toBe(0);
  expect(await git(checkout, ["branch", "--show-current"])).toBe("");
  expect(await git(checkout, ["rev-parse", "HEAD"])).toBe(h.base);

  const run = async (...args: string[]) => {
    const result = await h.run(args, checkout);
    expect(result.exitCode, `${result.command}\n${result.output}`).toBe(0);
    return result.stdout;
  };
  const current = join(checkout, ".arc/active/current");
  const adr = ".arc/reference/adr/001-search-model.md";
  await mkdir(dirname(join(checkout, adr)), { recursive: true });
  await writeFile(join(checkout, adr), "# Search model\n\n**Status:** Accepted\n\nIndex search results by project.\n");
  await writeFile(join(current, `spec-${slug}.md`), "# Spec: Search model\n\n**Purpose:** Index results by project.\n");
  await run("save");
  await run("finalize", "create-spec", "--class", "Novel");
  await run("repoint-design", "spec-finalized");

  const finalize = (await readFile(join(checkout, ".arc/system/workflows/arc/create-spec.md"), "utf8"))
    .split(/^## Finalize\b/mu)[1]?.split(/^## Next Step/mu)[0] ?? "";
  const activation = await readFile(join(checkout,
    ".arc/system/workflows/arc/work-unit-lifecycle/activate-work-unit.md"), "utf8");
  const commitAdr = async (): Promise<void> => {
    await git(checkout, ["add", "--", adr]);
    await git(checkout, ["commit", "-m", "docs(adr): record search model", "-m", `Context: spec-${slug}.md (planning)`]);
  };
  if (finalize.includes("`commit-interlock` release")) await commitAdr();

  await writeFile(join(current, `tasks-${slug}.md`), "# Task List: Search model\n\n## **Phase 1:** Search\n\n"
    + "### `[ ]` **1.1 Index results**\n\n- _Goal:_ Index results by project.\n");
  await run("save");
  await run("finalize", "generate-tasks", "--class", "Novel");
  const oldBranch = `plan/${slug}`;
  const oldTip = branchKind === "renamed" ? await linkOldBranch(h, checkout, slug, oldBranch) : undefined;
  const beforeActivate = activation.split("arc activate {name}")[0] ?? "";
  const pointer = beforeActivate.match(/`(activate-work-unit Step \d+ — [^`]+<paths>)`/u)?.[1];
  const metaPath = (await run("view", "meta", "--path")).trim();
  if (pointer !== undefined && /`\*\*Next Action:\*\*`[\s\S]*`arc save`/u.test(beforeActivate)) {
    const action = pointer.replace("<paths>", adr);
    await writeFile(metaPath, setMetaBulletFields(await readFile(metaPath, "utf8"), { "Next Action": action }));
    await run("save");
  }
  const nextAction = parseMetaRecord(await run("view", "meta")).nextAction;
  expect.soft(nextAction, "The pending commit is saved while the unit is still Planning").toContain(adr);
  await run("activate", slug, "--type", "feat", "--action", nextAction ?? "Index results");
  expect(await git(checkout, ["branch", "--show-current"])).toBe(`feat/${slug}`);
  expect(await git(checkout, ["rev-parse", "HEAD"])).toBe(h.base);
  expect(await git(checkout, ["status", "--porcelain", "--", adr])).toBe(`?? ${adr}`);

  const resumed = JSON.parse(await run("status", "--session-init", "--json")) as SessionInitProbeResult;
  expect(resumed.active).toMatchObject({ ok: true, value: { currentWorkflow: "process-task-loop" } });
  if (!resumed.active.ok || resumed.active.value.path === null) throw new Error("Expected a work unit to resume");
  const resumedAction = parseMetaRecord(await readFile(join(checkout, resumed.active.value.path), "utf8")).nextAction;
  expect(resumedAction, "A fresh session sees the pending commit before starting the current task")
    .toMatch(/^activate-work-unit Step \d+ — Commit the accepted ADR or research/u);
  expect(resumedAction).toContain(adr);

  const afterActivate = activation.slice(activation.indexOf("arc activate {name}"), activation.indexOf("### 4)"));
  if (afterActivate.includes("`workflowCommit`")) await commitAdr();
  expect(await git(checkout, ["rev-parse", "HEAD^"])).toBe(h.base);
  expect(await git(checkout, ["show", "--format=", "--name-only", "HEAD"])).toBe(adr);
  expect(await git(h.repo, ["rev-parse", "main"])).toBe(h.base);
  if (oldTip !== undefined) {
    const { nextAction: publication } = parseMetaRecord(await run("view", "meta"));
    await publishAfterResume(checkout, activation, publication ?? "");
    const preservedBy = await git(h.repo, ["--git-dir", h.origin, "for-each-ref", "--format=%(refname)", "--contains", oldTip, "refs/heads"]);
    expect(preservedBy, "The replacement on origin contains the old tip and the old branch is gone").toBe(`refs/heads/feat/${slug}`);
  }
}, LIFECYCLE_TIMEOUT_MS);

it("publishes the checked-out branch from the saved action when activation reuses a stored link", async () => {
  const h = await lifecycleRepository({ protection: "full", remote: true });
  const slug = "example";
  const checkout = h.checkoutPath(slug);
  const started = await h.run(["start", slug, "--new", "--yes"]);
  expect(started.exitCode, started.output).toBe(0);

  const target = `feat/${slug}`;
  const retained = "feat/previous";
  const planning = `plan/${slug}`;
  await git(checkout, ["branch", retained]);
  await git(checkout, ["switch", "-c", planning]);
  await storeBranchLinks(checkout, slug, [target, retained, planning]);

  const activation = await readFile(join(checkout, ".arc/system/workflows/arc/work-unit-lifecycle/activate-work-unit.md"), "utf8");
  const action = "activate-work-unit Step 4 — Publish the work branch";
  const activated = await h.run(["activate", slug, "--type", "feat", "--action", action], checkout);
  expect(activated.exitCode, activated.output).toBe(0);
  expect(activated.output).toMatch(/Branch:\s+feat\/example/u);
  expect(await git(checkout, ["branch", "--show-current"])).toBe(target);

  const { nextAction } = parseMetaRecord((await readLifecycleMeta(checkout, slug)).content);
  expect(nextAction).toBe(action);
  await publishAfterResume(checkout, activation, nextAction ?? "");
  expect(await git(h.repo, ["--git-dir", h.origin, "for-each-ref", "--format=%(refname)", "refs/heads/feat/"]))
    .toBe(`refs/heads/${target}`);
}, LIFECYCLE_TIMEOUT_MS);

async function linkOldBranch(h: Awaited<ReturnType<typeof lifecycleRepository>>, checkout: string, slug: string,
  branch: string): Promise<string> {
  await writeFile(join(checkout, "remote-work.txt"), "Search work\n");
  await git(checkout, ["add", "--", "remote-work.txt"]);
  await git(checkout, ["commit", "-m", "Work from another checkout"]);
  const tip = await git(checkout, ["rev-parse", "HEAD"]);
  await git(checkout, ["push", "origin", `HEAD:refs/heads/${branch}`]);
  await git(checkout, ["switch", "-c", branch, h.base]);
  await storeBranchLinks(checkout, slug, [branch]);
  return tip;
}

async function storeBranchLinks(checkout: string, slug: string, refs: string[]): Promise<void> {
  const meta = await readLifecycleMeta(checkout, slug);
  const repository = (await readProjectIdentityBinding(selectStore(createDefaultStorePorts({ checkoutRoot: checkout }), {}))).id;
  await seedStore(checkout, LIFECYCLE_IDENTITY, [{ reference: meta.reference, expected: meta.version,
    content: meta.content, placement: { kind: "active" },
    links: { branches: refs.map(ref => ({ repository, ref, linkedAs: "created", excluded: [] })) } }]);
}

async function publishAfterResume(checkout: string, workflow: string, action: string): Promise<void> {
  const pushStep = workflow.slice(workflow.indexOf("### 4)"), workflow.indexOf("### 5)"));
  const [, oldBranch, oldTip] = action.match(/\borigin branch (\S+) at ([0-9a-f]{40,64})\b/u) ?? [];
  const [beforePush = "", afterPush = ""] = pushStep.split("`workflowPush`");
  expect(beforePush).toMatch(/`git branch --show-current`[^.]*`\{branch\}`/u);
  const branch = await git(checkout, ["branch", "--show-current"]);
  if (oldTip !== undefined && beforePush.includes("git merge --ff --no-edit <old-tip>")) {
    await git(checkout, ["merge", "--ff", "--no-edit", oldTip]);
  }
  await git(checkout, ["push", "-u", "origin", branch]);
  if (oldBranch !== undefined && oldTip !== undefined && afterPush.includes("--force-with-lease=refs/heads/<old-branch>:<old-tip>")) {
    await git(checkout, ["merge-base", "--is-ancestor", oldTip, "HEAD"]);
    await git(checkout, ["push", `--force-with-lease=refs/heads/${oldBranch}:${oldTip}`, "origin", "--delete", oldBranch]);
  }
}
