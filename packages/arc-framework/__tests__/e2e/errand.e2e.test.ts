/**
 * `arc errand check` E2E.
 *
 * Exercises the built CLI end-to-end: `arc errand check` reports which in-flight
 * work units touch the target path(s), emitting the overlap facts as JSON for
 * skill consumption. This covers the real path resolution that unit tests stub.
 */

import { execFile } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";

import { describe, it, expect, beforeEach, afterEach } from "vitest";

import { runArc, createTempRepo, cleanupTempDir } from "./helpers.js";

const execFileAsync = promisify(execFile);

/** Run a git command in `cwd` and return its stdout. */
async function git(cwd: string, args: string[]): Promise<string> {
  const { stdout } = await execFileAsync("git", args, { cwd });
  return stdout;
}

/** Flip the installed config's branch.protection (default `partial`) to `full`. */
async function setFullProtection(cwd: string): Promise<void> {
  const path = join(cwd, ".arc", "system", "arc-config.yml");
  const yaml = await readFile(path, "utf-8");
  await writeFile(path, yaml.replace("branch.protection: partial", "branch.protection: full"), "utf-8");
}

describe("arc errand check", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await createTempRepo();
    const init = await runArc(["init", "--yes", "--name", "test-project"], tmpDir);
    expect(init.exitCode).toBe(0);
  });

  afterEach(async () => {
    await cleanupTempDir(tmpDir);
  });

  it("reports no overlap as JSON when no other work unit is in flight", async () => {
    const result = await runArc(
      ["errand", "check", "--target", "docs/x.md", "--json"],
      tmpDir,
    );

    expect(result.exitCode).toBe(0);
    // `reachable` reflects the oracle's remote read; the sandbox repo has no
    // reachable remote, so the no-overlap result carries `reachable: false`.
    expect(JSON.parse(result.stdout.trim())).toEqual({ overlaps: [], reachable: false });
  });
});

describe("arc errand cut", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await createTempRepo();
    const init = await runArc(["init", "--yes", "--name", "test-project"], tmpDir);
    expect(init.exitCode).toBe(0);
    // The base (`main`) needs a tip to fork from. `--no-verify` skips the
    // project hooks `arc init` installs (the fixture message is not under test).
    await git(tmpDir, ["commit", "--allow-empty", "--no-verify", "-m", "init"]);
  });

  afterEach(async () => {
    await cleanupTempDir(tmpDir);
  });

  it("cuts chore/<slug> off branch.base, at the base's tip", async () => {
    const result = await runArc(["errand", "cut", "fix-typo"], tmpDir);

    expect(result.exitCode).toBe(0);
    expect(await git(tmpDir, ["branch", "--list", "chore/fix-typo"])).toContain("chore/fix-typo");
    const choreSha = (await git(tmpDir, ["rev-parse", "chore/fix-typo"])).trim();
    const mainSha = (await git(tmpDir, ["rev-parse", "main"])).trim();
    expect(choreSha).toBe(mainSha);
  });

  it("is a no-clobber no-op when the branch already exists — the ref is not moved", async () => {
    await runArc(["errand", "cut", "fix-typo"], tmpDir);
    const before = (await git(tmpDir, ["rev-parse", "chore/fix-typo"])).trim();
    // Advance the base; a force-create would move the errand branch onto the new tip.
    await git(tmpDir, ["commit", "--allow-empty", "--no-verify", "-m", "second"]);

    const result = await runArc(["errand", "cut", "fix-typo"], tmpDir);

    expect(result.exitCode).toBe(0);
    const after = (await git(tmpDir, ["rev-parse", "chore/fix-typo"])).trim();
    expect(after).toBe(before);
    expect(after).not.toBe((await git(tmpDir, ["rev-parse", "main"])).trim());
  });
});

describe("arc errand open", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await createTempRepo();
    const init = await runArc(["init", "--yes", "--name", "test-project"], tmpDir);
    expect(init.exitCode).toBe(0);
    await git(tmpDir, ["commit", "--allow-empty", "--no-verify", "-m", "init"]);
  });

  afterEach(async () => {
    await cleanupTempDir(tmpDir);
  });

  it("refuses under partial protection — an errand there is a direct base commit, no branch", async () => {
    const result = await runArc(["errand", "open", "fix-typo"], tmpDir);

    expect(result.exitCode).toBe(1);
    expect(await git(tmpDir, ["branch", "--list", "chore/fix-typo"])).toBe("");
  });

  it("mints the record, cuts a nature-typed branch, and occupies it in place under full protection", async () => {
    await setFullProtection(tmpDir);

    const result = await runArc(["errand", "open", "flaky-login", "--type", "fix"], tmpDir);

    expect(result.exitCode).toBe(0);
    // The branch is cut nature-typed off the base's tip.
    expect(await git(tmpDir, ["branch", "--list", "fix/flaky-login"])).toContain("fix/flaky-login");
    expect((await git(tmpDir, ["rev-parse", "fix/flaky-login"])).trim()).toBe(
      (await git(tmpDir, ["rev-parse", "main"])).trim(),
    );
    // The session occupies the errand branch — never left on the launch branch.
    expect((await git(tmpDir, ["rev-parse", "--abbrev-ref", "HEAD"])).trim()).toBe("fix/flaky-login");
    // The identity record is minted in the orphan state-ref, projecting the branch.
    const record = await git(tmpDir, ["cat-file", "-p", "refs/arc/user/test-user/errands:flaky-login"]);
    expect(record).toContain('"branch": "fix/flaky-login"');
    expect(record).toContain('"origin": "description"');
  });

  it("rejects an out-of-set branch type (feat is a work unit, not an errand)", async () => {
    await setFullProtection(tmpDir);

    const result = await runArc(["errand", "open", "new-thing", "--type", "feat"], tmpDir);

    expect(result.exitCode).toBe(1);
    expect(await git(tmpDir, ["branch", "--list", "feat/new-thing"])).toBe("");
  });
});

describe("arc errand close", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await createTempRepo();
    const init = await runArc(["init", "--yes", "--name", "test-project"], tmpDir);
    expect(init.exitCode).toBe(0);
    await git(tmpDir, ["commit", "--allow-empty", "--no-verify", "-m", "init"]);
  });

  afterEach(async () => {
    await cleanupTempDir(tmpDir);
  });

  it("refuses under partial protection", async () => {
    const result = await runArc(["errand", "close", "anything"], tmpDir);

    expect(result.exitCode).toBe(1);
  });

  it("reaps the branch, removes the record, and hops back to base", async () => {
    await setFullProtection(tmpDir);
    const open = await runArc(["errand", "open", "tidy", "--type", "chore"], tmpDir);
    expect(open.exitCode).toBe(0);
    expect((await git(tmpDir, ["rev-parse", "--abbrev-ref", "HEAD"])).trim()).toBe("chore/tidy");

    const result = await runArc(["errand", "close", "tidy"], tmpDir);

    expect(result.exitCode).toBe(0);
    // The branch is reaped and the session is back on the base.
    expect(await git(tmpDir, ["branch", "--list", "chore/tidy"])).toBe("");
    expect((await git(tmpDir, ["rev-parse", "--abbrev-ref", "HEAD"])).trim()).toBe("main");
    // The identity record is gone from the orphan state-ref.
    await expect(git(tmpDir, ["cat-file", "-p", "refs/arc/user/test-user/errands:tidy"])).rejects.toThrow();
  });

  it("is a clean no-op when no record exists for the slug", async () => {
    await setFullProtection(tmpDir);

    const result = await runArc(["errand", "close", "never-opened"], tmpDir);

    expect(result.exitCode).toBe(0);
  });

  it("refuses an unsafe branch but reaps it with --force", async () => {
    await setFullProtection(tmpDir);
    await runArc(["errand", "open", "wip", "--type", "fix"], tmpDir);
    // A commit ahead of base, never pushed — not provably preserved.
    await git(tmpDir, ["commit", "--allow-empty", "--no-verify", "-m", "wip"]);
    await git(tmpDir, ["switch", "main"]);

    const refused = await runArc(["errand", "close", "wip"], tmpDir);
    expect(refused.exitCode).toBe(1);
    expect(await git(tmpDir, ["branch", "--list", "fix/wip"])).toContain("fix/wip");

    const forced = await runArc(["errand", "close", "wip", "--force"], tmpDir);
    expect(forced.exitCode).toBe(0);
    expect(await git(tmpDir, ["branch", "--list", "fix/wip"])).toBe("");
  });

  it("leaves unrelated inbox captures untouched (a description errand drops nothing)", async () => {
    await setFullProtection(tmpDir);
    const inboxDir = join(tmpDir, ".arc", "user", "test-user");
    const inboxPath = join(inboxDir, "USER-INBOX.md");
    const inbox = "# User Inbox\n\n## Errand\n\n### `[ ]` **Keep me**\n\n- _Observation:_ unrelated.\n\n---\n";
    await mkdir(inboxDir, { recursive: true });
    await writeFile(inboxPath, inbox, "utf-8");

    await runArc(["errand", "open", "tidy", "--type", "chore"], tmpDir);
    const result = await runArc(["errand", "close", "tidy"], tmpDir);

    expect(result.exitCode).toBe(0);
    expect(await readFile(inboxPath, "utf-8")).toContain("**Keep me**");
  });
});

describe("arc errand retire", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await createTempRepo();
    const init = await runArc(["init", "--yes", "--name", "test-project"], tmpDir);
    expect(init.exitCode).toBe(0);
    await git(tmpDir, ["commit", "--allow-empty", "--no-verify", "-m", "init"]);
  });

  afterEach(async () => {
    await cleanupTempDir(tmpDir);
  });

  it("refuses under partial protection", async () => {
    const result = await runArc(["errand", "retire", "anything"], tmpDir);

    expect(result.exitCode).toBe(1);
  });

  it("removes the record while the renamed work-unit branch survives", async () => {
    await setFullProtection(tmpDir);
    const open = await runArc(["errand", "open", "growing", "--type", "fix"], tmpDir);
    expect(open.exitCode).toBe(0);
    // Promotion renames the errand branch into the work-unit branch before retiring the record.
    await git(tmpDir, ["branch", "-m", "fix/growing", "feat/growing-feature"]);

    const result = await runArc(["errand", "retire", "growing"], tmpDir);

    expect(result.exitCode).toBe(0);
    // The record is gone from the orphan state-ref...
    await expect(git(tmpDir, ["cat-file", "-p", "refs/arc/user/test-user/errands:growing"])).rejects.toThrow();
    // ...but the renamed branch is untouched.
    expect(await git(tmpDir, ["branch", "--list", "feat/growing-feature"])).toContain("feat/growing-feature");
  });

  it("is a clean no-op when no record exists for the slug", async () => {
    await setFullProtection(tmpDir);

    const result = await runArc(["errand", "retire", "never-opened"], tmpDir);

    expect(result.exitCode).toBe(0);
  });
});

describe("arc errand promote", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await createTempRepo();
    const init = await runArc(["init", "--yes", "--name", "test-project"], tmpDir);
    expect(init.exitCode).toBe(0);
    await git(tmpDir, ["commit", "--allow-empty", "--no-verify", "-m", "init"]);
  });

  afterEach(async () => {
    await cleanupTempDir(tmpDir);
  });

  it("refuses under partial protection", async () => {
    const result = await runArc(["errand", "promote", "anything", "--floor", "scale"], tmpDir);

    expect(result.exitCode).toBe(1);
  });

  it("requires --floor — the crossed floor is the agent's judgment", async () => {
    await setFullProtection(tmpDir);
    await runArc(["errand", "open", "growing", "--type", "fix"], tmpDir);

    const result = await runArc(["errand", "promote", "growing", "--name", "growth"], tmpDir);

    expect(result.exitCode).toBe(1);
    // No rename happened — the errand branch survives for a retry.
    expect(await git(tmpDir, ["branch", "--list", "fix/growing"])).toContain("fix/growing");
  });

  it("derivation crossing → renames the branch, mints a Planning meta at draft-design, retires the record", async () => {
    await setFullProtection(tmpDir);
    await runArc(["errand", "open", "growing", "--type", "fix"], tmpDir);

    const result = await runArc(
      ["errand", "promote", "growing", "--name", "growth-feature", "--type", "feat", "--floor", "derivation"],
      tmpDir,
    );

    expect(result.exitCode).toBe(0);
    // Branch renamed into the WU branch; the errand name is gone.
    expect(await git(tmpDir, ["branch", "--list", "feat/growth-feature"])).toContain("feat/growth-feature");
    expect(await git(tmpDir, ["branch", "--list", "fix/growing"])).toBe("");
    // Record retired from the orphan state-ref.
    await expect(git(tmpDir, ["cat-file", "-p", "refs/arc/user/test-user/errands:growing"])).rejects.toThrow();
    // Meta minted at the planning stage the derivation floor dictates.
    const meta = await readFile(join(tmpDir, ".arc", "active", "meta-growth-feature.md"), "utf-8");
    expect(meta).toContain("# Metadata: growth-feature");
    expect(meta).toMatch(/\bPlanning\b/u);
    expect(meta).toContain("feat/growth-feature");
    expect(meta).toContain("draft-design");
  });

  it("scale crossing → mints an Active meta with no draft-design pointer", async () => {
    await setFullProtection(tmpDir);
    await runArc(["errand", "open", "sweeping", "--type", "chore"], tmpDir);

    const result = await runArc(
      ["errand", "promote", "sweeping", "--name", "sweep-unit", "--type", "refactor", "--floor", "scale"],
      tmpDir,
    );

    expect(result.exitCode).toBe(0);
    const meta = await readFile(join(tmpDir, ".arc", "active", "meta-sweep-unit.md"), "utf-8");
    expect(meta).toMatch(/\bActive\b/u);
    expect(meta).not.toContain("draft-design");
  });
});
