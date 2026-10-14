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

const pushGateId = "0123456789abcdef0123456789abcdef";
const pushGate = { env: { ARC_PUSH_GATE_ID: pushGateId } };

async function gateRecords(root: string): Promise<string[]> {
  const records = await readdir(join(root, ".git/arc-checks")).catch((error: NodeJS.ErrnoException) => {
    if (error.code === "ENOENT") return [];
    throw error;
  });
  return records.filter(path => path.startsWith("pre-push."));
}

async function gateRefusal(root: string): Promise<unknown> {
  return JSON.parse(await readFile(join(root, `.git/arc-checks/pre-push.${pushGateId}.json`), "utf8"));
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

const rejectBad = "process.exit(process.argv.slice(1).some(f => require('node:fs').readFileSync(f, 'utf8').includes('bad')) ? 1 : 0)";

/** Push `feature` from its last pushed tip, after it merged `main` carrying a bad file `origin/main` may also carry. */
async function mergedFeature(publish: boolean): Promise<{ root: string; push: () => ReturnType<typeof runArcWithStdin> }> {
  const root = await createDeclaredCheckRepository({ content: { gate: "push", mode: "files", widen: false,
    inputs: ["src/**"], command: [process.execPath, "-e", rejectBad] } });
  roots.push(root);
  await git(root, ["restore", "src/a.ts"]);
  await git(root, ["update-ref", "refs/remotes/origin/main", "HEAD"]);
  await git(root, ["checkout", "-b", "feature"]);
  await writeFile(join(root, "src/own.ts"), "good\n");
  await git(root, ["add", "src/own.ts"]);
  await git(root, ["commit", "-m", "own"]);
  const pushed = await git(root, ["rev-parse", "HEAD"]);
  await git(root, ["checkout", "main"]);
  await writeFile(join(root, "src/incoming.ts"), "bad\n");
  await git(root, ["add", "src/incoming.ts"]);
  await git(root, ["commit", "-m", "incoming"]);
  if (publish) await git(root, ["update-ref", "refs/remotes/origin/main", "HEAD"]);
  await git(root, ["checkout", "feature"]);
  await git(root, ["merge", "--no-ff", "main", "-m", "merge base"]);
  const push = async () => {
    const tip = await git(root, ["rev-parse", "HEAD"]);
    return runArcWithStdin(["check", "pre-push", "origin", "local-origin", "--json"], root,
      `refs/heads/feature ${tip} refs/heads/feature ${pushed}\n`);
  };
  return { root, push };
}

it("holds a push only for files it changed, not files a base merge brought in unchanged", async () => {
  const { root, push } = await mergedFeature(true);
  const merged = await push();
  expect(merged.exitCode, merged.stderr).toBe(0);
  expect(JSON.parse(merged.stdout).result.checks).toMatchObject([{ id: "content", outcome: "not selected",
    reason: "every changed file was merged in unchanged", mergedIn: ["src/incoming.ts"] }]);

  await writeFile(join(root, "src/own.ts"), "bad\n");
  await git(root, ["commit", "-am", "own regression"]);
  const own = await push();
  expect(own.exitCode, own.stderr).toBe(1);
  expect(JSON.parse(own.stdout).result.checks).toMatchObject([{ id: "content", outcome: "failed",
    mergedIn: ["src/incoming.ts"] }]);
});

it("holds a push for files a merge brought in that the remote base branch does not carry", async () => {
  const { push } = await mergedFeature(false);
  const held = await push();
  expect(held.exitCode, held.stderr).toBe(1);
  const [check] = JSON.parse(held.stdout).result.checks;
  expect(check).toMatchObject({ id: "content", outcome: "failed" });
  expect(check).not.toHaveProperty("mergedIn");
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
  const invalid = await runArcWithStdin(["check", "pre-push", "origin", "local-origin", "--json"], root, lines, pushGate);
  expect(invalid.exitCode, invalid.stderr).toBe(2);
  expect(JSON.parse(invalid.stdout).error.message).toContain(branch);
  expect(JSON.parse(invalid.stdout).error.message).toContain("arc-checks.yml");
  expect(await passRecords(root)).toEqual([]);
  expect(await gateRefusal(root)).toEqual({ schemaVersion: 1, error: expect.stringContaining("arc-checks.yml"), checks: [] });
  await writeFile(declarationPath, declaration);
  const repaired = await runArcWithStdin(["check", "pre-push", "origin", "local-origin", "--json"], root, lines,
    { env: { ARC_PUSH_GATE_ID: "fedcba9876543210fedcba9876543210" } });
  expect(repaired.exitCode, repaired.stderr).toBe(0);
  expect(JSON.parse(repaired.stdout).result.checks[0].outcome).toBe("passed");
  expect(await gateRecords(root)).toEqual([`pre-push.${pushGateId}.json`]);
});

it("records a refusing push gate's failing checks only for a push that names itself", async () => {
  const root = await createDeclaredCheckRepository({ content: { gate: "push", mode: "files", widen: false,
    inputs: ["src/**"], command: [process.execPath, "-e", "console.log('content is wrong'); process.exit(1)"] } });
  roots.push(root);
  const base = await git(root, ["rev-parse", "HEAD"]);
  await git(root, ["add", "src/a.ts"]);
  await git(root, ["commit", "-m", "tip"]);
  const tip = await git(root, ["rev-parse", "HEAD"]);
  const branch = await git(root, ["symbolic-ref", "HEAD"]);

  const lines = `${branch} ${tip} ${branch} ${base}\n`;
  const unnamed = await runArcWithStdin(["check", "pre-push", "origin", "local-origin"], root, lines);
  expect(unnamed.exitCode, unnamed.stderr).toBe(1);
  expect(await gateRecords(root)).toEqual([]);

  const result = await runArcWithStdin(["check", "pre-push", "origin", "local-origin"], root, lines, pushGate);

  expect(result.exitCode, result.stderr).toBe(1);
  const refusal = await gateRefusal(root);
  expect(refusal).toMatchObject({ schemaVersion: 1,
    checks: [{ id: "content", outcome: "failed", logPath: expect.any(String), remedy: expect.stringContaining("content") }] });
  expect(refusal).not.toHaveProperty("error");
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

it("reuses a new-head pass over the same range at the push boundary", async () => {
  const root = await createDeclaredCheckRepository({ content: { gate: "push", mode: "files", inputs: ["src/**"],
    command: [process.execPath, "-e", "require('node:fs').appendFileSync('receipt.json','executed\\n')"] } });
  roots.push(root);
  const base = await git(root, ["rev-parse", "HEAD"]);
  await git(root, ["add", "src/a.ts"]);
  await git(root, ["commit", "-m", "tip"]);
  const tip = await git(root, ["rev-parse", "HEAD"]);
  const branch = await git(root, ["symbolic-ref", "HEAD"]);
  const newHead = await runArc(["check", "new-head", "--from", base], root);
  expect(newHead.exitCode, newHead.stderr).toBe(0);
  expect(newHead.stdout).toContain("Checks: 1 passed.");
  expect(newHead.stdout).not.toContain("warning:");
  const push = await runArcWithStdin(["check", "pre-push", "origin", "local-origin", "--json"], root,
    `${branch} ${tip} ${branch} ${base}\n`);
  expect(push.exitCode, push.stderr).toBe(0);
  expect(JSON.parse(push.stdout).result.checks[0].outcome).toBe("reused");
  expect(await readFile(join(root, "receipt.json"), "utf8")).toBe("executed\n");
});

it("passes with a warning when its record directory is blocked, and later gates run the check again", async () => {
  const root = await createDeclaredCheckRepository({ content: { gate: "push", mode: "files", inputs: ["src/**"],
    command: [process.execPath, "-e", "require('node:fs').appendFileSync('receipt.json','executed\\n')"] } });
  roots.push(root);
  const directory = join(await git(root, ["rev-parse", "--absolute-git-dir"]), "arc-checks");
  await writeFile(directory, "not a directory\n");
  const base = await git(root, ["rev-parse", "HEAD"]);
  await git(root, ["add", "src/a.ts"]);
  await git(root, ["commit", "-m", "tip"]);
  const tip = await git(root, ["rev-parse", "HEAD"]);
  const branch = await git(root, ["symbolic-ref", "HEAD"]);
  const newHead = await runArc(["check", "new-head", "--from", base], root);
  expect(newHead.exitCode, newHead.stderr).toBe(0);
  expect(newHead.stdout).toContain("Checks: 1 passed.");
  expect(newHead.stdout).toContain(`warning: could not record passes in ${directory}; later gates will run content again`);
  const push = await runArcWithStdin(["check", "pre-push", "origin", "local-origin", "--json"], root,
    `${branch} ${tip} ${branch} ${base}\n`);
  expect(push.exitCode, push.stderr).toBe(0);
  expect(JSON.parse(push.stdout).result.checks[0]).toMatchObject({ outcome: "passed",
    record: { status: "unavailable", cause: "other", directory } });
  expect(await readFile(join(root, "receipt.json"), "utf8")).toBe("executed\nexecuted\n");
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
