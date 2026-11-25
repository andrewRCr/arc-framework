/** Planning stays detached until activation gives the accepted ADR a work branch. */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { expect, it } from "vitest";

import { lifecycleRepository, LIFECYCLE_TIMEOUT_MS } from "../helpers/store-lifecycle-fixture.js";
import { git } from "./helpers.js";

it("activates a spawned work unit with its accepted ADR on the work branch", async () => {
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
  await run("activate", slug, "--type", "feat", "--action", "Index results");
  expect(await git(checkout, ["branch", "--show-current"])).toBe(`feat/${slug}`);
  expect(await git(checkout, ["rev-parse", "HEAD"])).toBe(h.base);

  const afterActivate = activation.slice(activation.indexOf("arc activate {name}"), activation.indexOf("### 4)"));
  if (/commit[\s\S]*\bADR\b|\bADR\b[\s\S]*commit/u.test(afterActivate)) await commitAdr();
  expect(await git(checkout, ["rev-parse", "HEAD^"])).toBe(h.base);
  expect(await git(checkout, ["show", "--format=", "--name-only", "HEAD"])).toBe(adr);
  expect(await git(h.repo, ["rev-parse", "main"])).toBe(h.base);
}, LIFECYCLE_TIMEOUT_MS);
