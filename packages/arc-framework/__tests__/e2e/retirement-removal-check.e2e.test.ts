/** Real CLI refusal before abandonment or Planning park records retirement. */
import { afterEach, describe, expect, it } from "vitest";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { cleanupTempDir, createTempRepo, git, runArc } from "./helpers.js";

let repo: string | undefined;
let remote: string | undefined;
afterEach(async () => { if (repo !== undefined) await cleanupTempDir(repo); repo = undefined; if (remote !== undefined) await cleanupTempDir(remote); remote = undefined; });

async function prepare(state: "Planning" | "Active") {
  repo = await createTempRepo();
  expect((await runArc(["init", "--yes", "--name", "retirement-check"], repo)).exitCode).toBe(0);
  await git(repo, ["add", "."]);
  await git(repo, ["commit", "-m", "chore: initialize ARC"]);
  remote = await mkdtemp(join(tmpdir(), "arc-retirement-origin-"));
  await git(remote, ["init", "--bare", "--initial-branch=main"]);
  await git(repo, ["remote", "add", "origin", remote]);
  await git(repo, ["push", "-u", "origin", "main"]);
  const branch = state === "Planning" ? "plan/demo" : "feat/demo";
  await git(repo, ["switch", "-c", branch]);
  await mkdir(join(repo, ".arc/active"), { recursive: true });
  const path = join(repo, ".arc/active/meta-demo.md");
  const content = ["# Metadata: demo", "", "| **State** | **Owner** | **Branch** | **Class** | **Priority** |", "| --- | --- | --- | --- | --- |", `| ${state} | test-user | ${branch} | Novel | P1 |`, "", "- **Cohort:** [none]", "- **Depends On:** [none]", "", "- **Last Completed:** [none]", "- **Next Task:** [none]", "- **Blockers:** [none]", "", "- **Next Action:** continue", "", "---", ""].join("\n");
  await writeFile(path, content);
  await git(repo, ["add", "-f", ".arc/active/meta-demo.md"]);
  await git(repo, ["commit", "-m", "chore: declare demo"]);
  await writeFile(join(repo, "dirty-file"), "keep this change\n");
  return { cwd: repo, path, content, head: await git(repo, ["rev-parse", "HEAD"]) };
}

describe("retirement checkout removal check", () => {
  it.each(["Planning", "Active"] as const)("refuses dirty %s abandonment with its artifacts and index intact", async (state) => {
    const h = await prepare(state);
    const result = await runArc(["abandon", "demo", "--yes"], h.cwd);
    expect(result.exitCode).toBe(1);
    expect(result.stdout + result.stderr).toContain("dirty-file");
    expect(await readFile(h.path, "utf8")).toBe(h.content);
    expect(await git(h.cwd, ["diff", "--cached", "--name-only"])).toBe("");
    expect(await git(h.cwd, ["rev-parse", "HEAD"])).toBe(h.head);
  });
  it("refuses activation whose meta Branch names main before preparing or staging", async () => {
    const h = await prepare("Planning");
    await git(h.cwd, ["switch", "main"]);
    await rm(join(h.cwd, "dirty-file"));
    await mkdir(join(h.cwd, ".arc/active"), { recursive: true });
    const content = h.content.replace("plan/demo", "main");
    await writeFile(h.path, content);
    await git(h.cwd, ["add", "-f", ".arc/active/meta-demo.md"]);
    await git(h.cwd, ["commit", "-m", "chore: declare base-naming planning work"]);
    const head = await git(h.cwd, ["rev-parse", "HEAD"]);
    const result = await runArc(["activate", "demo", "--type", "feat", "--task", "1.1", "--action", "continue"], h.cwd);
    expect(result.exitCode).toBe(1);
    expect(result.stdout + result.stderr).toContain("git switch -c feat/demo");
    expect(result.stdout + result.stderr).toContain("arc activate");
    expect(await git(h.cwd, ["branch", "--show-current"])).toBe("main");
    expect(await git(h.cwd, ["rev-parse", "HEAD"])).toBe(head);
    expect(await git(h.cwd, ["diff", "--cached", "--name-only"])).toBe("");
    expect(await readFile(h.path, "utf8")).toBe(content);
  });
  it("refuses dirty Planning park before relocation or staging", async () => {
    const h = await prepare("Planning");
    const result = await runArc(["park", "demo", "--reason", "pause"], h.cwd);
    expect(result.exitCode).toBe(1);
    expect(result.stdout + result.stderr).toContain("dirty-file");
    expect(await readFile(h.path, "utf8")).toBe(h.content);
    expect(await git(h.cwd, ["diff", "--cached", "--name-only"])).toBe("");
    expect(await git(h.cwd, ["rev-parse", "HEAD"])).toBe(h.head);
  });
});
