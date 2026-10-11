/** Push requests select the pushed range and retain its exact checked tip. */
import { afterEach, expect, it } from "vitest";
import { readFile, access, readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { createDeclaredCheckRepository } from "../fixtures/checks/repository.js";
import { removeGitBackedDirs } from "../helpers/temp-repo.js";
import { git, runArc, runArcWithStdin } from "./helpers.js";
const roots: string[] = [];
afterEach(async () => { await removeGitBackedDirs(roots.splice(0)); });

async function passRecords(root: string): Promise<string[]> {
  const records = await readdir(join(root, ".git/arc-checks")).catch((error: NodeJS.ErrnoException) => {
    if (error.code === "ENOENT") return [];
    throw error;
  });
  return records.filter(path => /^[a-f0-9]{64}\.json$/u.test(path));
}

it("gates the current branch's stdin range at the pushed tip", async () => {
  const root = await createDeclaredCheckRepository({ content: { gate: "push", mode: "files", widen: false,
    inputs: ["src/**"], command: [process.execPath, "capture.cjs"] } });
  roots.push(root);
  const base = await git(root, ["rev-parse", "HEAD"]);
  await git(root, ["add", "src/a.ts"]);
  await git(root, ["commit", "-m", "tip"]);
  const tip = await git(root, ["rev-parse", "HEAD"]);
  const tree = await git(root, ["rev-parse", "HEAD^{tree}"]);
  const branch = await git(root, ["symbolic-ref", "HEAD"]);
  const result = await runArcWithStdin(["check", "pre-push", "origin", "local-origin", "--json"], root,
    `${branch} ${tip} ${branch} ${base}\n`);
  expect(result.exitCode, result.stderr).toBe(0);
  expect(JSON.parse(result.stdout).result).toMatchObject({ base, tree,
    checks: [{ id: "content", outcome: "passed" }] });
  expect(JSON.parse(await readFile(join(root, "receipt.json"), "utf8")).args).toEqual(["src/a.ts"]);
});

it("keeps the branch ref unambiguous when a tag shares its short name", async () => {
  const root = await createDeclaredCheckRepository({ content: { gate: "push", inputs: ["src/**"],
    command: [process.execPath, "capture.cjs"] } });
  roots.push(root);
  const base = await git(root, ["rev-parse", "HEAD"]);
  await git(root, ["add", "src/a.ts"]);
  await git(root, ["commit", "-m", "tip"]);
  const tip = await git(root, ["rev-parse", "HEAD"]);
  const branch = await git(root, ["symbolic-ref", "HEAD"]);
  await git(root, ["tag", branch.slice("refs/heads/".length)]);
  const result = await runArcWithStdin(["check", "pre-push", "origin", "local-origin", "--json"], root,
    `${branch} ${tip} ${branch} ${base}\n`);
  expect(result.exitCode, result.stderr).toBe(0);
  expect(JSON.parse(result.stdout).result.checks[0]?.outcome).toBe("passed");
});

it("preserves valid nonbreaking spaces in Git branch names", async () => {
  const root = await createDeclaredCheckRepository({ content: { gate: "push", inputs: ["src/**"],
    command: [process.execPath, "capture.cjs"] } });
  roots.push(root);
  const branchName = "feature/nonbreaking\u00a0word";
  const branch = `refs/heads/${branchName}`;
  await git(root, ["switch", "-c", branchName]);
  const base = await git(root, ["rev-parse", "HEAD"]);
  await git(root, ["add", "src/a.ts"]);
  await git(root, ["commit", "-m", "tip"]);
  const tip = await git(root, ["rev-parse", "HEAD"]);
  const result = await runArcWithStdin(["check", "pre-push", "origin", "local-origin", "--json"], root,
    `${branch} ${tip} ${branch} ${base}\n`);
  expect(result.exitCode, result.stderr).toBe(0);
  expect(JSON.parse(result.stdout).result).toMatchObject({ checks: [{ outcome: "passed" }],
    pushRefs: [{ ref: branch, outcome: "checked" }] });
});

it("attributes an invalid push request to its ref and permits a repaired retry", async () => {
  const root = await createDeclaredCheckRepository({ content: { gate: "push", mode: "files", inputs: ["src/**"],
    command: [process.execPath, "capture.cjs"] } });
  roots.push(root);
  const base = await git(root, ["rev-parse", "HEAD"]);
  await git(root, ["add", "src/a.ts"]);
  await git(root, ["commit", "-m", "tip"]);
  const tip = await git(root, ["rev-parse", "HEAD"]);
  const branch = await git(root, ["symbolic-ref", "HEAD"]);
  const declarationPath = join(root, ".arc/system/arc-checks.yml");
  const declaration = await readFile(declarationPath, "utf8");
  await writeFile(declarationPath, "checks: invalid\n");
  const lines = `${branch} ${tip} ${branch} ${base}\n`;
  const invalid = await runArcWithStdin(["check", "pre-push", "origin", "local-origin", "--json"], root, lines);
  expect(invalid.exitCode, invalid.stderr).toBe(2);
  expect(JSON.parse(invalid.stdout).error.message).toContain(branch);
  expect(JSON.parse(invalid.stdout).error.message).toContain("arc-checks.yml");
  expect(await passRecords(root)).toEqual([]);
  await writeFile(declarationPath, declaration);
  const repaired = await runArcWithStdin(["check", "pre-push", "origin", "local-origin", "--json"], root, lines);
  expect(repaired.exitCode, repaired.stderr).toBe(0);
  expect(JSON.parse(repaired.stdout).result.checks[0].outcome).toBe("passed");
});

it("widens an automatic pushed base that is unavailable locally", async () => {
  const root = await createDeclaredCheckRepository({ content: { gate: "push", mode: "files",
    inputs: ["src/**"], command: [process.execPath, "capture.cjs"] } });
  roots.push(root);
  await git(root, ["add", "src/a.ts"]);
  await git(root, ["commit", "-m", "tip"]);
  const tip = await git(root, ["rev-parse", "HEAD"]);
  const branch = await git(root, ["symbolic-ref", "HEAD"]);
  const result = await runArcWithStdin(["check", "pre-push", "origin", "local-origin", "--json"], root,
    `${branch} ${tip} ${branch} ${"c".repeat(40)}\n`);
  expect(result.exitCode, result.stderr).toBe(0);
  expect(JSON.parse(result.stdout).result.checks[0].outcome).toBe("passed");
  expect(JSON.parse(await readFile(join(root, "receipt.json"), "utf8")).args).toEqual(["src/a.ts", "src/deleted.ts"]);
});

it("retries a widened push through its guarded Git operation after repair", async () => {
  const root = await createDeclaredCheckRepository({ content: { gate: "push", mode: "files",
    inputs: ["src/**"], command: [process.execPath, "-e", "process.exit(require('node:fs').readFileSync('src/a.ts','utf8') === 'repaired\\n' ? 0 : 1)"] } });
  roots.push(root);
  await git(root, ["add", "src/a.ts"]);
  await git(root, ["commit", "-m", "tip"]);
  const tip = await git(root, ["rev-parse", "HEAD"]);
  const branch = await git(root, ["symbolic-ref", "HEAD"]);
  const lines = `${branch} ${tip} ${branch} ${"c".repeat(40)}\n`;
  const failed = await runArcWithStdin(["check", "pre-push", "origin", "local-origin", "--json"], root, lines);
  expect(failed.exitCode, failed.stderr).toBe(1);
  expect(JSON.parse(failed.stdout).result.checks[0].remedy).toBe("git push");
  await writeFile(join(root, "src/a.ts"), "repaired\n");
  await git(root, ["add", "src/a.ts"]);
  await git(root, ["commit", "-m", "repair"]);
  const repairedTip = await git(root, ["rev-parse", "HEAD"]);
  const repaired = await runArcWithStdin(["check", "pre-push", "origin", "local-origin", "--json"], root,
    `${branch} ${repairedTip} ${branch} ${"c".repeat(40)}\n`);
  expect(repaired.exitCode, repaired.stderr).toBe(0);
  expect(JSON.parse(repaired.stdout).result.checks[0].outcome).toBe("passed");
});

it("reuses a segment pass over the same range at the push boundary", async () => {
  const root = await createDeclaredCheckRepository({ content: { gate: "push", mode: "files", inputs: ["src/**"],
    command: [process.execPath, "-e", "require('node:fs').appendFileSync('receipt.json','executed\\n')"] } });
  roots.push(root);
  const base = await git(root, ["rev-parse", "HEAD"]);
  await git(root, ["remote", "add", "origin", "local-origin"]);
  await git(root, ["update-ref", "refs/remotes/origin/main", base]);
  await git(root, ["branch", "--set-upstream-to=origin/main"]);
  const segment = await runArc(["check", "segment", "--json"], root);
  expect(segment.exitCode, segment.stderr).toBe(0);
  expect(JSON.parse(segment.stdout).result.checks[0].outcome).toBe("passed");
  await git(root, ["add", "src/a.ts"]);
  await git(root, ["commit", "-m", "tip"]);
  const tip = await git(root, ["rev-parse", "HEAD"]);
  const branch = await git(root, ["symbolic-ref", "HEAD"]);
  const push = await runArcWithStdin(["check", "pre-push", "origin", "local-origin", "--json"], root,
    `${branch} ${tip} ${branch} ${base}\n`);
  expect(push.exitCode, push.stderr).toBe(0);
  expect(JSON.parse(push.stdout).result.checks[0].outcome).toBe("reused");
  expect(await readFile(join(root, "receipt.json"), "utf8")).toBe("executed\n");
});

it("checks nothing when Git supplies no ref lines", async () => {
  const root = await createDeclaredCheckRepository({ content: { gate: "push", inputs: ["src/**"],
    command: [process.execPath, "capture.cjs"] } });
  roots.push(root);
  const result = await runArcWithStdin(["check", "pre-push", "origin", "local-origin", "--json"], root, "");
  expect(result.exitCode, result.stderr).toBe(0);
  expect(JSON.parse(result.stdout).result).toMatchObject({ checks: [], pushRefs: [], verification: "Checks: no refs selected." });
  await expect(access(join(root, "receipt.json"))).rejects.toMatchObject({ code: "ENOENT" });
});

it("honors a person's named skips at the push boundary and reports unknown names", async () => {
  const root = await createDeclaredCheckRepository({ content: { gate: "push", inputs: ["src/**"],
    command: [process.execPath, "-e", "process.exit(1)"] } });
  roots.push(root);
  const base = await git(root, ["rev-parse", "HEAD"]);
  await git(root, ["add", "src/a.ts"]);
  await git(root, ["commit", "-m", "tip"]);
  const tip = await git(root, ["rev-parse", "HEAD"]);
  const branch = await git(root, ["symbolic-ref", "HEAD"]);
  const result = await runArcWithStdin(["check", "pre-push", "origin", "local-origin", "--json"], root,
    `${branch} ${tip} ${branch} ${base}\n`, { env: { ARC_SKIP: "content,unknown" } });
  expect(result.exitCode, result.stderr).toBe(0);
  expect(JSON.parse(result.stdout).result).toMatchObject({ ignoredSkips: ["unknown"],
    checks: [{ outcome: "skipped", reason: "ARC_SKIP" }] });
  expect(await passRecords(root)).toEqual([]);
});

it("fails a push fixer's rewrite while keeping the pushed tree as the checked subject", async () => {
  const root = await createDeclaredCheckRepository({ format: { gate: "commit", inputs: ["src/**"], fixes: true,
    command: [process.execPath, "-e", "require('node:fs').writeFileSync('src/a.ts','formatted\\n')"] } });
  roots.push(root);
  const base = await git(root, ["rev-parse", "HEAD"]);
  await git(root, ["add", "src/a.ts"]);
  await git(root, ["commit", "-m", "tip"]);
  const tip = await git(root, ["rev-parse", "HEAD"]);
  const tree = await git(root, ["rev-parse", "HEAD^{tree}"]);
  const branch = await git(root, ["symbolic-ref", "HEAD"]);
  const result = await runArcWithStdin(["check", "pre-push", "origin", "local-origin", "--json"], root,
    `${branch} ${tip} ${branch} ${base}\n`);
  expect(result.exitCode, result.stderr).toBe(1);
  expect(JSON.parse(result.stdout).result).toMatchObject({ tree,
    checks: [{ outcome: "failed", rewritten: ["src/a.ts"] }] });
  expect(await readFile(join(root, "src/a.ts"), "utf8")).toBe("formatted\n");
  expect(await passRecords(root)).toEqual([]);
});

it("names the gated code ref when its check fails beside state updates", async () => {
  const root = await createDeclaredCheckRepository({ content: { gate: "push", inputs: ["src/**"],
    command: [process.execPath, "-e", "process.exit(1)"] } });
  roots.push(root);
  const base = await git(root, ["rev-parse", "HEAD"]);
  await git(root, ["add", "src/a.ts"]);
  await git(root, ["commit", "-m", "tip"]);
  const tip = await git(root, ["rev-parse", "HEAD"]);
  const branch = await git(root, ["symbolic-ref", "HEAD"]);
  const result = await runArcWithStdin(["check", "pre-push", "origin", "local-origin"], root,
    `refs/arc/state ${tip} refs/arc/state ${base}\n${branch} ${tip} ${branch} ${base}\n`);
  expect(result.exitCode, result.stderr).toBe(1);
  expect(result.stdout).toContain(branch);
  expect(result.stdout).toContain("content: failed");
});

it("labels worktree content ahead of the pushed tip and records no pass", async () => {
  const root = await createDeclaredCheckRepository({ content: { gate: "push", mode: "files", widen: false,
    inputs: ["src/**"], command: [process.execPath, "capture.cjs"] } });
  roots.push(root);
  const base = await git(root, ["rev-parse", "HEAD"]);
  await git(root, ["add", "src/a.ts"]);
  await git(root, ["commit", "-m", "pushed tip"]);
  const tip = await git(root, ["rev-parse", "HEAD"]);
  const tree = await git(root, ["rev-parse", "HEAD^{tree}"]);
  await writeFile(join(root, "src/a.ts"), "ahead\n");
  await git(root, ["add", "src/a.ts"]);
  await git(root, ["commit", "-m", "ahead"]);
  const branch = await git(root, ["symbolic-ref", "HEAD"]);
  const result = await runArcWithStdin(["check", "pre-push", "origin", "local-origin", "--json"], root,
    `${branch} ${tip} ${branch} ${base}\n`);
  expect(result.exitCode, result.stderr).toBe(0);
  expect(JSON.parse(result.stdout).result).toMatchObject({ tree,
    checks: [{ outcome: "passed", divergent: ["src/a.ts"] }] });
  expect(await passRecords(root)).toEqual([]);
});

it.each(["Git stdin", "manager whole history"])("starts a new remote ref at its remote base through %s", async source => {
  const root = await createDeclaredCheckRepository({ content: { gate: "push", mode: "files", widen: false,
    inputs: ["src/**"], command: [process.execPath, "capture.cjs"] } });
  roots.push(root);
  const base = await git(root, ["rev-parse", "HEAD"]);
  await git(root, ["switch", "-c", "feat/pushed"]);
  await git(root, ["add", "src/a.ts"]);
  await git(root, ["commit", "-m", "tip"]);
  const tip = await git(root, ["rev-parse", "HEAD"]);
  const branch = await git(root, ["symbolic-ref", "HEAD"]);
  await git(root, ["update-ref", "refs/heads/main", tip]);
  await git(root, ["remote", "add", "target", "local-target"]);
  await git(root, ["update-ref", "refs/remotes/target/main", base]);
  const manager = source === "manager whole history";
  const result = await runArcWithStdin(["check", "pre-push", manager ? "" : "target", manager ? "" : "local-target", "--json"], root,
    manager ? "" : `${branch} ${tip} ${branch} ${"0".repeat(40)}\n`, manager ? { env: {
      PRE_COMMIT_LOCAL_BRANCH: branch, PRE_COMMIT_REMOTE_BRANCH: branch,
      PRE_COMMIT_REMOTE_NAME: "target", PRE_COMMIT_REMOTE_URL: "local-target",
    } } : undefined);
  expect(result.exitCode, result.stderr).toBe(0);
  expect(JSON.parse(result.stdout).result).toMatchObject({ base, checks: [{ outcome: "passed" }] });
  expect(JSON.parse(await readFile(join(root, "receipt.json"), "utf8")).args).toEqual(["src/a.ts"]);
});

it("reports another pushed ref as not selected and still gates the current branch", async () => {
  const root = await createDeclaredCheckRepository({ content: { gate: "push", mode: "files", widen: false,
    inputs: ["src/**"], command: [process.execPath, "capture.cjs"] } });
  roots.push(root);
  const base = await git(root, ["rev-parse", "HEAD"]);
  await git(root, ["add", "src/a.ts"]);
  await git(root, ["commit", "-m", "tip"]);
  const tip = await git(root, ["rev-parse", "HEAD"]);
  const branch = await git(root, ["symbolic-ref", "HEAD"]);
  const result = await runArcWithStdin(["check", "pre-push", "origin", "local-origin", "--json"], root,
    `refs/heads/foreign ${tip} refs/heads/foreign ${base}\n${branch} ${tip} ${branch} ${base}\n`);
  expect(result.exitCode, result.stderr).toBe(0);
  expect(JSON.parse(result.stdout).result.pushRefs).toMatchObject([
    { ref: "refs/heads/foreign", outcome: "not selected", reason: expect.stringContaining("worktree") },
    { ref: branch, outcome: "checked" },
  ]);
  expect(JSON.parse(result.stdout).result.checks).toHaveLength(1);
  expect(JSON.parse(await readFile(join(root, "receipt.json"), "utf8")).args).toEqual(["src/a.ts"]);
  const foreign = await runArcWithStdin(["check", "pre-push", "origin", "local-origin"], root,
    `refs/tags/review ${tip} refs/tags/review ${base}\n`);
  expect(foreign.stdout).toContain("refs/tags/review: not selected");
  expect(foreign.stdout).toContain("worktree");
});

it("skips state ref updates and deletions without running a gate", async () => {
  const root = await createDeclaredCheckRepository({ content: { gate: "push", inputs: ["src/**"],
    command: [process.execPath, "capture.cjs"] } });
  roots.push(root);
  const base = await git(root, ["rev-parse", "HEAD"]);
  await git(root, ["add", "src/a.ts"]);
  await git(root, ["commit", "-m", "tip"]);
  const tip = await git(root, ["rev-parse", "HEAD"]);
  const result = await runArcWithStdin(["check", "pre-push", "origin", "local-origin", "--json"], root,
    `refs/arc/state ${tip} refs/arc/state ${base}\n(delete) ${"0".repeat(40)} refs/heads/old ${base}\n`);
  expect(result.exitCode, result.stderr).toBe(0);
  expect(JSON.parse(result.stdout).result.checks).toEqual([]);
  expect(JSON.parse(result.stdout).result.pushRefs).toMatchObject([
    { ref: "refs/arc/state", outcome: "skipped" }, { ref: "(delete)", outcome: "skipped" },
  ]);
  await expect(access(join(root, "receipt.json"))).rejects.toMatchObject({ code: "ENOENT" });
});
