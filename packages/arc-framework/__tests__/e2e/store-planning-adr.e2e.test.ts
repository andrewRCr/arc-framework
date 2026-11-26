/** Planning stays detached until activation gives the accepted ADR a work branch. */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { expect, it } from "vitest";

import type { SessionInitProbeResult } from "../../src/commands/status/types.js";
import { parseMetaRecord, setMetaBulletFields } from "../../src/lib/active/meta-reader.js";
import { lifecycleRepository, LIFECYCLE_TIMEOUT_MS } from "../helpers/store-lifecycle-fixture.js";
import { git } from "./helpers.js";

it("resumes an interrupted activation by committing its accepted ADR before task work", async () => {
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
  const beforeActivate = activation.split("arc activate {name}")[0] ?? "";
  const pointer = beforeActivate.match(/`(activate-work-unit Step \d+ — [^`]+)`/u)?.[1];
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
}, LIFECYCLE_TIMEOUT_MS);
