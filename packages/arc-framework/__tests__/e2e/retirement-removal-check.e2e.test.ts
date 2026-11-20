/** Real CLI refusal before abandonment or Planning park records retirement. */
import { afterEach, describe, expect, it } from "vitest";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { cleanupTempDir, createTempRepo, git, runArc } from "./store-default.js";
import { useInRepoStore } from "../helpers/in-repo-store-override.js";
import { readStoreRecord } from "../helpers/store/seed-store.js";
import { seededWorkUnitSubject, seedWorkUnit } from "../helpers/store/seed-work-unit.js";
import { writeWorktreeMarker } from "../../src/lib/git/worktree-marker.js";
import { SlugSchema } from "../../src/lib/kernel/index.js";

let repo: string | undefined;
let remote: string | undefined;
let checkouts: string | undefined;
afterEach(async () => {
  for (const dir of [repo, remote, checkouts]) if (dir !== undefined) await cleanupTempDir(dir);
  repo = remote = checkouts = undefined;
});

async function initialize() {
  repo = await createTempRepo();
  expect((await runArc(["init", "--yes", "--name", "retirement-check"], repo)).exitCode).toBe(0);
  await git(repo, ["add", "."]);
  await git(repo, ["commit", "-m", "chore: initialize ARC"]);
  remote = await mkdtemp(join(tmpdir(), "arc-retirement-origin-"));
  await git(remote, ["init", "--bare", "--initial-branch=main"]);
  await git(repo, ["remote", "add", "origin", remote]);
  await git(repo, ["push", "-u", "origin", "main"]);
  return repo;
}

/** A Planning work unit's meta committed on its plan branch, as the in-repo store holds it, beside a dirty file. */
async function prepare() {
  const repo = await initialize();
  const branch = "plan/demo";
  await git(repo, ["switch", "-c", branch]);
  await mkdir(join(repo, ".arc/active"), { recursive: true });
  const path = join(repo, ".arc/active/meta-demo.md");
  const content = ["# Metadata: demo", "", "| **State** | **Owner** | **Branch** | **Class** | **Priority** |", "| --- | --- | --- | --- | --- |", `| Planning | test-user | ${branch} | Novel | P1 |`, "", "- **Cohort:** [none]", "- **Depends On:** [none]", "", "- **Last Completed:** [none]", "- **Next Task:** [none]", "- **Blockers:** [none]", "", "- **Next Action:** continue", "", "---", ""].join("\n");
  await writeFile(path, content);
  await git(repo, ["add", "-f", ".arc/active/meta-demo.md"]);
  await git(repo, ["commit", "-m", "chore: declare demo"]);
  await writeFile(join(repo, "dirty-file"), "keep this change\n");
  return { cwd: repo, path, content, head: await git(repo, ["rev-parse", "HEAD"]) };
}

/** A work unit held in the store, with the linked checkout ARC spawned for it holding a dirty file: an Active one on
 * its created branch, a Planning one detached at base. Abandonment removes such a checkout, where it releases one ARC
 * did not spawn and keeps its files. */
async function prepareSeeded(state: "Planning" | "Active") {
  const repo = await initialize();
  const { meta } = await seedWorkUnit(repo, "demo", { identity: "test-user",
    meta: state === "Active" ? { state, owner: "test-user", branch: "feat/demo" }
      : { state, owner: "test-user", branch: null, currentWorkflow: "draft-design" },
    ...(state === "Active" ? { branch: "feat/demo" } : {}) });
  await writeFile(join(repo, ".git", "info", "exclude"), ".arc/system/.internal/worktree-marker.json\n", { flag: "a" });
  checkouts = await mkdtemp(join(tmpdir(), "arc-retirement-checkout-"));
  const cwd = join(checkouts, "demo");
  await git(repo, state === "Active" ? ["worktree", "add", "-b", "feat/demo", cwd, "main"] : ["worktree", "add", "--detach", cwd, "main"]);
  await writeWorktreeMarker(cwd, { spawnedByArc: true, wuName: "demo", createdFor: seededWorkUnitSubject(meta),
    spawningIdentity: "test-user", createdAt: "2026-10-24T00:00:00.000Z" });
  await writeFile(join(cwd, "dirty-file"), "keep this change\n");
  const record = async () => readStoreRecord(repo, SlugSchema.parse("test-user"), meta.reference);
  return { cwd, record, before: await record(), head: await git(cwd, ["rev-parse", "HEAD"]) };
}

describe("retirement checkout removal check", () => {
  it.each(["Planning", "Active"] as const)("refuses dirty %s abandonment with its artifacts and index intact", async (state) => {
    const h = await prepareSeeded(state);
    const result = await runArc(["abandon", "demo", "--yes"], h.cwd);
    expect(result.exitCode, result.stdout + result.stderr).toBe(1);
    expect(result.stdout + result.stderr).toContain("dirty-file");
    expect(await h.record()).toEqual(h.before);
    expect(await git(h.cwd, ["diff", "--cached", "--name-only"])).toBe("");
    expect(await git(h.cwd, ["rev-parse", "HEAD"])).toBe(h.head);
  });
  // The meta's Branch field selects activation's branch only in the in-repo store; the store creates the work unit's
  // branch when activation runs from base.
  it("refuses activation whose meta Branch names main before preparing or staging", async () => {
    useInRepoStore();
    const h = await prepare();
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
    useInRepoStore();
    const h = await prepare();
    const result = await runArc(["park", "demo", "--reason", "pause"], h.cwd);
    expect(result.exitCode).toBe(1);
    expect(result.stdout + result.stderr).toContain("dirty-file");
    expect(await readFile(h.path, "utf8")).toBe(h.content);
    expect(await git(h.cwd, ["diff", "--cached", "--name-only"])).toBe("");
    expect(await git(h.cwd, ["rev-parse", "HEAD"])).toBe(h.head);
  });
});
