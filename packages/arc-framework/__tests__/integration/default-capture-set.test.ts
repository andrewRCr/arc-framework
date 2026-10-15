/** Local commit inventory against real Git history and bounded remote refreshes. */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { createTempRepo, cleanupTempDir, makeGitExec } from "../helpers/integration.js";
import { computeDefaultCaptureSet, resolveLinkedCheckoutBranch } from "../../src/lib/git/default-capture-set.js";
import { createLifecycleHarness, lifecycleSuccess } from "../helpers/store/lifecycle-harness.js";
import { runTaskClose } from "../../src/lib/work-unit/verbs/task-close.js";
import { recordPut } from "../../src/lib/store/lifecycle-write.js";
import { recordReferences } from "../../src/lib/store/identity.js";
import type { GitExec } from "../../src/lib/git/exec.js";

describe("default capture set", () => {
  let cwd: string;
  let exec: GitExec;
  beforeEach(async () => {
    cwd = await createTempRepo();
    exec = makeGitExec(cwd);
    await exec("git", ["branch", "-M", "main"]);
    await writeFile(join(cwd, "base.txt"), "base\n");
    await exec("git", ["add", "base.txt"]);
    await exec("git", ["commit", "-m", "initial base"]);
    await exec("git", ["switch", "-c", "feat/work"]);
  });
  afterEach(async () => { await cleanupTempDir(cwd); });

  async function commit(content: string): Promise<string> {
    await writeFile(join(cwd, "work.txt"), content);
    await exec("git", ["add", "work.txt"]);
    await exec("git", ["commit", "-m", "change work"]);
    return (await exec("git", ["rev-parse", "HEAD"])).stdout.trim();
  }

  it("includes work commits and removes repository-qualified captures and exclusions", async () => {
    const captured = await commit("one\n");
    const excluded = await commit("two\n");
    const current = await commit("three\n");
    const result = await computeDefaultCaptureSet({ exec, cwd, baseBranch: "main", repository: "project",
      captures: [{ repository: "project", sha: captured }], exclusions: [{ repository: "project", sha: excluded }] });
    expect(result.status).toBe("available");
    if (result.status !== "available") return;
    expect(result.commits.map((value) => value.sha)).toEqual([current]);
    expect(result.baseRefreshed).toBeNull();
  });

  it("refuses missing base refs with a local repair and continues after repair", async () => {
    const sha = await commit("one\n");
    await exec("git", ["branch", "-D", "main"]);
    const input = { exec, cwd, baseBranch: "main", repository: "project" };
    const result = await computeDefaultCaptureSet(input);
    expect(result.status).toBe("refused");
    if (result.status !== "refused") return;
    expect(result.remedy).toContain("git branch main <commit>");
    await exec("git", ["branch", "main", `${sha}^`]);
    const repaired = await computeDefaultCaptureSet(input);
    expect(repaired.status).toBe("available");
    if (repaired.status === "available") expect(repaired.commits.map((value) => value.sha)).toEqual([sha]);
  });

  it("resolves linked, detached, unlinked and branchless checkouts distinctly", async () => {
    const link = { repository: "project", ref: "feat/work", linkedAs: "created" as const, excluded: [] };
    const input = { exec, cwd, repository: "project", branches: [link] };
    expect(await resolveLinkedCheckoutBranch(input)).toEqual({ kind: "linked", link });
    const qualified = { ...link, ref: "refs/heads/feat/work" };
    expect(await resolveLinkedCheckoutBranch({ ...input, branches: [qualified] }))
      .toEqual({ kind: "linked", link: qualified });
    await exec("git", ["switch", "--detach"]);
    expect(await resolveLinkedCheckoutBranch(input)).toEqual({ kind: "detached" });
    expect(await resolveLinkedCheckoutBranch({ ...input, branches: [] })).toEqual({ kind: "no-link" });
    await exec("git", ["switch", "main"]);
    expect(await resolveLinkedCheckoutBranch(input)).toEqual({ kind: "unlinked", branch: "main" });
  });

  it("refuses duplicate canonical links before closing tasks and retries with repaired exclusions", async () => {
    const excluded = await commit("excluded\n"), h = createLifecycleHarness();
    const short = { repository: "project", ref: "feat/work", linkedAs: "created" as const, excluded: [] };
    const qualified = { ...short, ref: "refs/heads/feat/work", excluded: [{ repository: "project", sha: excluded }] };
    const meta = await h.seedMeta("work", { taskList: "tasks-work.md" }, { kind: "active" }, { branches: [short, qualified] });
    const tasks = await h.seed(recordReferences["work-item/task-list"](meta.reference.owner),
      "# Task List: work\n\n## **Phase 1:** Work\n\n### `[ ]` **1.1 Work**\n");
    const ctx = { store: h.store, cwd, slug: "work", exec, projectId: async () => "project", baseBranch: "main" };
    expect(await runTaskClose(ctx)).toMatchObject({ status: "refused", reason: expect.stringContaining("ambiguous"),
      remedy: { text: expect.stringContaining("Repair duplicate branch links") } });
    expect(lifecycleSuccess(await h.store.read({ reference: meta.reference }))).toEqual(meta);
    expect(lifecycleSuccess(await h.store.read({ reference: tasks.reference }))).toEqual(tasks);
    lifecycleSuccess(await h.store.write({ ...recordPut(meta, { links: { branches: [qualified] } }),
      provenance: { verb: "code-link", lifecycleAction: "repair-links" } }));
    expect(await runTaskClose(ctx)).toMatchObject({ status: "closed", captured: [] });
    expect(lifecycleSuccess(await h.store.read({ reference: tasks.reference })).content).toContain("`[x]` **1.1 Work**");
    expect(lifecycleSuccess(await h.store.read({ reference: meta.reference })).links?.branches).toEqual([qualified]);
  });

  it("omits commits introduced by a base merge", async () => {
    const work = await commit("one\n");
    await exec("git", ["switch", "main"]);
    await writeFile(join(cwd, "base.txt"), "advanced base\n");
    await exec("git", ["add", "base.txt"]);
    await exec("git", ["commit", "-m", "advance base"]);
    await exec("git", ["switch", "feat/work"]);
    await exec("git", ["merge", "--no-edit", "main"]);
    const result = await computeDefaultCaptureSet({ exec, cwd, baseBranch: "main", repository: "project" });
    expect(result.status).toBe("available");
    if (result.status === "available") expect(result.commits.map((value) => value.sha)).toEqual([work]);
  });

  it("refreshes base independently of a branch never pushed and a narrow clone refspec", async () => {
    const work = await commit("one\n");
    const remote = join(cwd, "origin.git");
    await exec("git", ["init", "--bare", remote]);
    await exec("git", ["remote", "add", "origin", remote]);
    await exec("git", ["push", "origin", "main"]);
    await exec("git", ["config", "remote.origin.fetch", "+refs/heads/feat/work:refs/remotes/origin/feat/work"]);
    await exec("git", ["update-ref", "-d", "refs/remotes/origin/main"]);
    const result = await computeDefaultCaptureSet({ exec, cwd, baseBranch: "main", repository: "project",
      refreshBranch: "feat/work" });
    expect(result.status).toBe("available");
    if (result.status !== "available") return;
    expect(result.commits.map((value) => value.sha)).toEqual([work]);
    expect(result.baseRefreshed).toBe(true);
    expect(result.warnings).toEqual([]);
    expect((await exec("git", ["rev-parse", "refs/remotes/origin/main"])).stdout)
      .toBe((await exec("git", ["rev-parse", "main"])).stdout);
  });

  it("reports offline inventory and names the fetch when no base resolves", async () => {
    const work = await commit("one\n");
    await exec("git", ["remote", "add", "origin", join(cwd, "absent.git")]);
    const input = { exec, cwd, baseBranch: "main", repository: "project" };
    const result = await computeDefaultCaptureSet(input);
    expect(result.status).toBe("available");
    if (result.status !== "available") return;
    expect(result.commits.map((value) => value.sha)).toEqual([work]);
    expect(result.baseRefreshed).toBe(false);
    expect(result.warnings.join(" ")).toContain("not refreshed");
    await exec("git", ["branch", "-D", "main"]);
    const refused = await computeDefaultCaptureSet(input);
    expect(refused.status).toBe("refused");
    if (refused.status === "refused") expect(refused.remedy)
      .toBe("git fetch origin +refs/heads/main:refs/remotes/origin/main");
  });
});
