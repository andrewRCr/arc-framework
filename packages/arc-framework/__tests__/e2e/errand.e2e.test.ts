/**
 * `arc errand check` E2E.
 *
 * Exercises the built CLI end-to-end: `arc errand check` reports which in-flight
 * work units touch the target path(s), emitting the overlap facts as JSON for
 * skill consumption. This covers the real path resolution that unit tests stub.
 */

import { execFile, spawn } from "node:child_process";
import { chmod, copyFile, mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

import { describe, it, expect, beforeEach, afterEach } from "vitest";

import { CLI_PATH } from "../helpers/cli-spawn.js";
import { runArc, runArcAnchoredSequence, createTempRepo, cleanupTempDir } from "./helpers.js";

const execFileAsync = promisify(execFile);

/** Run a git command in `cwd` and return its stdout. */
async function git(cwd: string, args: string[]): Promise<string> {
  const { stdout } = await execFileAsync("git", args, { cwd });
  return stdout;
}

/** Run a git plumbing command whose payload is supplied on stdin. */
async function gitWithInput(cwd: string, args: string[], input: string): Promise<string> {
  return await new Promise((resolve, reject) => {
    const child = spawn("git", args, { cwd, stdio: ["pipe", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf-8");
    child.stderr.setEncoding("utf-8");
    child.stdout.on("data", (chunk: string) => { stdout += chunk; });
    child.stderr.on("data", (chunk: string) => { stderr += chunk; });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve(stdout);
      else reject(new Error(`git ${args.join(" ")} exited ${String(code)}: ${stderr}`));
    });
    child.stdin.end(input);
  });
}

interface LegacyErrandFixture {
  slug: string;
  type: "chore" | "fix";
  intent?: string;
  originEntry?: string;
}

/** Seed the close-only v2 generation without retaining a public v2-producing command path. */
async function seedLegacyErrand(cwd: string, fixture: LegacyErrandFixture): Promise<void> {
  const returnBranch = (await git(cwd, ["rev-parse", "--abbrev-ref", "HEAD"])).trim();
  const branch = `${fixture.type}/${fixture.slug}`;
  await git(cwd, ["switch", "-c", branch, "main"]);
  const record = {
    version: 2,
    slug: fixture.slug,
    origin: fixture.originEntry === undefined ? "description" : "inbox",
    intent: fixture.intent ?? fixture.slug,
    branch,
    createdAt: "2026-07-21T00:00:00.000Z",
    ...(fixture.originEntry === undefined ? {} : { originEntry: fixture.originEntry }),
    ...(returnBranch === branch ? {} : { returnBranch }),
  };
  const blob = (await gitWithInput(cwd, ["hash-object", "-w", "--stdin"], `${JSON.stringify(record, null, 2)}\n`))
    .trim();
  const tree = (await gitWithInput(cwd, ["mktree"], `100644 blob ${blob}\t${fixture.slug}\n`)).trim();
  const commit = (await git(cwd, ["commit-tree", tree, "-m", `seed legacy errand ${fixture.slug}`])).trim();
  await git(cwd, ["update-ref", "refs/arc/user/test-user/errands", commit]);
}

/** Seed one exact v3 awaiting tail for command-boundary refusal coverage. */
async function seedAwaitingV3Errand(cwd: string, slug: string): Promise<void> {
  const headSha = (await git(cwd, ["rev-parse", "HEAD"])).trim();
  const record = {
    version: 3,
    slug,
    claimId: "c".repeat(32),
    createdAt: "2026-07-21T00:00:00.000Z",
    updatedAt: "2026-07-21T00:01:00.000Z",
    kind: "errand",
    purpose: "errand",
    intent: slug,
    branch: `chore/${slug}`,
    origin: "description",
    originEntry: null,
    dispatchId: null,
    state: "awaiting-merge",
    savedHead: null,
    changeRequest: {
      repositoryRef: "owner/repo",
      hostRef: "github.com",
      baseRef: "main",
      headRef: `chore/${slug}`,
      headSha,
    },
  };
  const blob = (await gitWithInput(cwd, ["hash-object", "-w", "--stdin"], `${JSON.stringify(record)}\n`)).trim();
  const tree = (await gitWithInput(cwd, ["mktree"], `100644 blob ${blob}\t${slug}\n`)).trim();
  const commit = (await git(cwd, ["commit-tree", tree, "-m", `seed v3 errand ${slug}`])).trim();
  await git(cwd, ["update-ref", "refs/arc/user/test-user/errands", commit]);
}

/** Seed one identity-only ordinary v3 open claim whose branch is preserved in base. */
async function seedOpenV3Errand(cwd: string, slug: string): Promise<void> {
  const headSha = (await git(cwd, ["rev-parse", "HEAD"])).trim();
  const branch = `chore/${slug}`;
  await git(cwd, ["branch", branch, headSha]);
  const record = {
    version: 3,
    slug,
    claimId: "d".repeat(32),
    createdAt: "2026-07-21T00:00:00.000Z",
    updatedAt: "2026-07-21T00:01:00.000Z",
    kind: "errand",
    purpose: "errand",
    intent: slug,
    branch,
    origin: "description",
    originEntry: null,
    dispatchId: null,
    state: "open",
    savedHead: null,
    changeRequest: null,
  };
  const blob = (await gitWithInput(cwd, ["hash-object", "-w", "--stdin"], `${JSON.stringify(record)}\n`)).trim();
  const tree = (await gitWithInput(cwd, ["mktree"], `100644 blob ${blob}\t${slug}\n`)).trim();
  const commit = (await git(cwd, ["commit-tree", tree, "-m", `seed v3 errand ${slug}`])).trim();
  await git(cwd, ["update-ref", "refs/arc/user/test-user/errands", commit]);
}

/** Flip the installed config's branch.protection (default `partial`) to `full`. */
async function setFullProtection(cwd: string): Promise<void> {
  const path = join(cwd, ".arc", "system", "arc-config.yml");
  const yaml = await readFile(path, "utf-8");
  const updated = yaml.replace("branch.protection: partial", "branch.protection: full");
  if (updated === yaml) {
    throw new Error("setFullProtection: expected `branch.protection: partial` in arc-config.yml");
  }
  await writeFile(path, updated, "utf-8");
}

async function setPartialProtection(cwd: string): Promise<void> {
  const path = join(cwd, ".arc", "system", "arc-config.yml");
  const yaml = await readFile(path, "utf-8");
  const updated = yaml.replace("branch.protection: full", "branch.protection: partial");
  if (updated === yaml) throw new Error("setPartialProtection: expected full protection");
  await writeFile(path, updated, "utf-8");
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
    expect(JSON.parse(result.stdout.trim())).toEqual({ overlaps: [], warnings: [], reachable: false });
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

  it("exposes JSON output without retaining the legacy nature-type option", async () => {
    const result = await runArc(["errand", "open", "--help"], tmpDir);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("--json");
    expect(result.stdout).not.toContain("--type");
  });

  it("does not flag a just-opened errand branch as no-record-or-meta residue on status <slug>", async () => {
    await setFullProtection(tmpDir);

    await seedLegacyErrand(tmpDir, { slug: "residue-probe", type: "fix" });

    const status = await runArc(["status", "residue-probe", "--json"], tmpDir);
    expect(status.exitCode).toBe(0);
    const payload = JSON.parse(status.stdout.trim()) as { warnings?: string[] };
    const residueWarnings = (payload.warnings ?? []).filter((line) =>
      /no errand record or active work-unit meta/i.test(line),
    );
    expect(residueWarnings).toEqual([]);
  });

  it("rejects the removed legacy nature-type option before mutation", async () => {
    await setFullProtection(tmpDir);

    const result = await runArc(["errand", "open", "new-thing", "--type", "feat"], tmpDir);

    expect(result.exitCode).toBe(1);
    expect(await git(tmpDir, ["branch", "--list", "feat/new-thing"])).toBe("");
  });
});

describe("tracked ROADMAP regen with errand records", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await createTempRepo();
    const init = await runArc(
      ["init", "--yes", "--name", "test-project", "--pm-mode", "arc-in-git"],
      tmpDir,
    );
    expect(init.exitCode).toBe(0);
    await git(tmpDir, ["commit", "--allow-empty", "--no-verify", "-m", "init"]);
    await setFullProtection(tmpDir);
  });

  afterEach(async () => {
    await cleanupTempDir(tmpDir);
  });

  it("does not flag a just-opened errand branch as residue in the regen advisory", async () => {
    await seedLegacyErrand(tmpDir, { slug: "residue-probe", type: "fix" });

    const stub = await runArc(
      ["stub", "advisory-probe", "--commitment", "provisional", "--priority", "P3"],
      tmpDir,
    );
    expect(stub.exitCode).toBe(0);
    expect(stub.stdout + stub.stderr).not.toMatch(/no errand record or active work-unit meta/i);
  });

  it("still flags a record-less typed branch as residue (fail-safe preserved)", async () => {
    await git(tmpDir, ["switch", "-c", "chore/no-record"]);

    const stub = await runArc(
      ["stub", "advisory-probe", "--commitment", "provisional", "--priority", "P3"],
      tmpDir,
    );
    expect(stub.exitCode).toBe(0);
    expect(stub.stdout + stub.stderr).toMatch(/no errand record or active work-unit meta/i);
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

  it("closes a pushed partial Errand and releases its primary occupancy", async () => {
    const remoteDir = `${tmpDir}-remote.git`;
    await execFileAsync("git", ["init", "--bare", remoteDir]);
    try {
      await git(tmpDir, ["add", "-A"]);
      await git(tmpDir, ["commit", "--no-verify", "-m", "track initialized project"]);
      await git(tmpDir, ["remote", "add", "origin", remoteDir]);
      await git(tmpDir, ["push", "-u", "origin", "main"]);
      const result = await runAnchoredSequence([
        [process.execPath, CLI_PATH, "errand", "open", "direct-fix", "--json"],
        ["git", "commit", "--allow-empty", "--no-verify", "-m", "fix direct"],
        ["git", "push", "origin", "main"],
        [process.execPath, CLI_PATH, "errand", "close", "direct-fix", "--json"],
      ], tmpDir);

      expect(result.exitCode, result.stdout + result.stderr).toBe(0);
      expect(result.results.at(-1)).toMatchObject({
        outcome: "applied",
        operation: "errand-close",
        identity: null,
        activeLocusPath: null,
      });
    } finally {
      await cleanupTempDir(remoteDir);
    }
  });

  it("reaps the branch, removes the record, and hops back to base", async () => {
    await setFullProtection(tmpDir);
    await seedLegacyErrand(tmpDir, { slug: "tidy", type: "chore" });
    expect((await git(tmpDir, ["rev-parse", "--abbrev-ref", "HEAD"])).trim()).toBe("chore/tidy");

    const result = await runArc(["errand", "close", "tidy"], tmpDir);

    expect(result.exitCode).toBe(0);
    // The branch is reaped and the session is back on the base.
    expect(await git(tmpDir, ["branch", "--list", "chore/tidy"])).toBe("");
    expect((await git(tmpDir, ["rev-parse", "--abbrev-ref", "HEAD"])).trim()).toBe("main");
    // The identity record is gone from the orphan state-ref.
    await expect(git(tmpDir, ["cat-file", "-p", "refs/arc/user/test-user/errands:tidy"])).rejects.toThrow();
  });

  it("restores the pre-open branch when main is held by the primary worktree", async () => {
    const linkedDir = `${tmpDir}-linked`;
    const remoteDir = `${tmpDir}-legacy-remote.git`;
    const harnessDir = await mkdtemp(join(tmpdir(), "arc-legacy-codex-"));
    const harness = join(harnessDir, "codex");
    await copyFile("/bin/bash", harness);
    await chmod(harness, 0o755);
    await setFullProtection(tmpDir);
    await git(tmpDir, ["add", ".arc/system/arc-config.yml"]);
    await git(tmpDir, ["commit", "--no-verify", "-m", "enable full protection"]);
    await execFileAsync("git", ["init", "--bare", remoteDir]);
    await git(tmpDir, ["remote", "add", "origin", remoteDir]);
    await git(tmpDir, ["push", "-u", "origin", "main"]);
    await git(tmpDir, ["branch", "feat/active-wu"]);
    await git(tmpDir, ["worktree", "add", linkedDir, "feat/active-wu"]);

    try {
      await seedLegacyErrand(linkedDir, { slug: "linked-fix", type: "fix" });
      await git(linkedDir, ["push", "origin", "refs/arc/user/test-user/errands:refs/arc/user/test-user/errands"]);
      expect((await git(linkedDir, ["rev-parse", "--abbrev-ref", "HEAD"])).trim()).toBe("fix/linked-fix");
      const record = await git(
        linkedDir,
        ["cat-file", "-p", "refs/arc/user/test-user/errands:linked-fix"],
      );
      expect(record).toContain('"returnBranch": "feat/active-wu"');

      await mkdir(join(linkedDir, ".arc", "system", "extensions"), { recursive: true });
      const displaced = await runArcAnchoredSequence([
        ["errand", "open", "linked-fix", "--json"],
      ], linkedDir, { anchorShellPath: harness });
      expect(displaced.exitCode).toBe(1);
      expect(displaced.results[0], JSON.stringify(displaced.results[0])).toMatchObject({
        outcome: "refused",
        operation: "errand-open",
        reason: "identity-conflict",
      });
      expect((await git(linkedDir, ["rev-parse", "--abbrev-ref", "HEAD"])).trim()).toBe("fix/linked-fix");

      const close = await runArc(["errand", "close", "linked-fix"], linkedDir);

      expect(close.exitCode).toBe(0);
      expect(await git(linkedDir, ["branch", "--list", "fix/linked-fix"])).toBe("");
      expect((await git(linkedDir, ["rev-parse", "--abbrev-ref", "HEAD"])).trim()).toBe("feat/active-wu");
      expect((await git(tmpDir, ["rev-parse", "--abbrev-ref", "HEAD"])).trim()).toBe("main");
    } finally {
      await git(tmpDir, ["worktree", "remove", "--force", linkedDir]);
      await cleanupTempDir(harnessDir);
      await cleanupTempDir(remoteDir);
    }
  });

  it("is a clean no-op when no record exists for the slug", async () => {
    await setFullProtection(tmpDir);

    const result = await runArc(["errand", "close", "never-opened"], tmpDir);

    expect(result.exitCode).toBe(0);
  });

  it("refuses an unsafe branch but reaps it with --force", async () => {
    await setFullProtection(tmpDir);
    await seedLegacyErrand(tmpDir, { slug: "wip", type: "fix" });
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

  it("returns one JSON refusal when --force targets a v3 tail", async () => {
    await setFullProtection(tmpDir);
    await seedAwaitingV3Errand(tmpDir, "exact-tail");

    const result = await runArc(["errand", "close", "exact-tail", "--force", "--json"], tmpDir);

    expect(result.exitCode).toBe(1);
    expect(JSON.parse(result.stdout.trim())).toMatchObject({
      outcome: "refused",
      operation: "errand-close",
      reason: "identity-conflict",
    });
    expect(result.stderr).toBe("");
    expect(await git(tmpDir, ["cat-file", "-p", "refs/arc/user/test-user/errands:exact-tail"]))
      .toContain('"state":"awaiting-merge"');
  });

  it("force-closes when the local branch was already deleted", async () => {
    await setFullProtection(tmpDir);
    await seedLegacyErrand(tmpDir, { slug: "host-deleted", type: "chore" });
    await git(tmpDir, ["switch", "main"]);
    await git(tmpDir, ["update-ref", "-d", "refs/heads/chore/host-deleted"]);

    const refused = await runArc(["errand", "close", "host-deleted"], tmpDir);
    expect(refused.exitCode).toBe(1);
    expect(refused.stdout + refused.stderr).toContain("--force");

    const forced = await runArc(["errand", "close", "host-deleted", "--force"], tmpDir);
    expect(forced.exitCode).toBe(0);
    await expect(
      git(tmpDir, ["cat-file", "-p", "refs/arc/user/test-user/errands:host-deleted"]),
    ).rejects.toThrow();
  });

  it("drops the originating capture at close when opened with --from-inbox (the producer→drain leg)", async () => {
    await setFullProtection(tmpDir);
    const inboxDir = join(tmpDir, ".arc", "user", "test-user");
    const inboxPath = join(inboxDir, "USER-INBOX.md");
    const inbox = "# User Inbox\n\n## Errand\n\n### `[ ]` **Drain me**\n\n- _Observation:_ adopt this.\n\n---\n";
    await mkdir(inboxDir, { recursive: true });
    await writeFile(inboxPath, inbox, "utf-8");

    await seedLegacyErrand(tmpDir, { slug: "adopt-it", type: "chore", originEntry: "Drain me" });
    // The record is inbox-origin, carrying the back-pointer the drain matches on.
    const record = await git(tmpDir, ["cat-file", "-p", "refs/arc/user/test-user/errands:adopt-it"]);
    expect(record).toContain('"origin": "inbox"');
    expect(record).toContain('"originEntry": "Drain me"');

    const close = await runArc(["errand", "close", "adopt-it"], tmpDir);
    expect(close.exitCode).toBe(0);
    // The originating capture is dropped — the drain that was universally dead before the producer leg.
    expect(await readFile(inboxPath, "utf-8")).not.toContain("**Drain me**");
  });

  it("adopts a Markdown-bearing capture title from a file operand", async () => {
    await setFullProtection(tmpDir);
    const title = "Run `arc user inbox-remove` after $(capture)";
    const inboxDir = join(tmpDir, ".arc", "user", "test-user");
    const inboxPath = join(inboxDir, "USER-INBOX.md");
    const inbox = `# User Inbox\n\n## Errand\n\n### \`[ ]\` **${title}**\n\n- _Observation:_ adopt safely.\n\n---\n`;
    await mkdir(inboxDir, { recursive: true });
    await writeFile(inboxPath, inbox, "utf-8");

    await seedLegacyErrand(tmpDir, { slug: "safe-title", type: "chore", originEntry: title });
    const record = await git(tmpDir, ["cat-file", "-p", "refs/arc/user/test-user/errands:safe-title"]);
    expect(record).toContain(`"originEntry": ${JSON.stringify(title)}`);

    const close = await runArc(["errand", "close", "safe-title"], tmpDir);
    expect(close.exitCode).toBe(0);
    expect(await readFile(inboxPath, "utf-8")).not.toContain(title);
  });

  it("leaves unrelated inbox captures untouched (a description errand drops nothing)", async () => {
    await setFullProtection(tmpDir);
    const inboxDir = join(tmpDir, ".arc", "user", "test-user");
    const inboxPath = join(inboxDir, "USER-INBOX.md");
    const inbox = "# User Inbox\n\n## Errand\n\n### `[ ]` **Keep me**\n\n- _Observation:_ unrelated.\n\n---\n";
    await mkdir(inboxDir, { recursive: true });
    await writeFile(inboxPath, inbox, "utf-8");

    await seedLegacyErrand(tmpDir, { slug: "tidy", type: "chore" });
    const result = await runArc(["errand", "close", "tidy"], tmpDir);

    expect(result.exitCode).toBe(0);
    expect(await readFile(inboxPath, "utf-8")).toContain("**Keep me**");
  });

  it("refuses a late link on a legacy record and leaves the capture unbound", async () => {
    await setFullProtection(tmpDir);
    const inboxDir = join(tmpDir, ".arc", "user", "test-user");
    const inboxPath = join(inboxDir, "USER-INBOX.md");
    const inbox = "# User Inbox\n\n## Errand\n\n### `[ ]` **Link me**\n\n- _Observation:_ adopt later.\n\n---\n";
    await mkdir(inboxDir, { recursive: true });
    await writeFile(inboxPath, inbox, "utf-8");

    await seedLegacyErrand(tmpDir, { slug: "late-adopt", type: "chore" });
    const link = await runArc([
      "errand", "link", "late-adopt", "--from-inbox", "Link me", "--json",
    ], tmpDir);
    expect(link.exitCode).toBe(1);
    expect(JSON.parse(link.stdout.trim())).toMatchObject({
      outcome: "refused",
      operation: "errand-link",
      reason: "identity-conflict",
    });
    const record = await git(tmpDir, ["cat-file", "-p", "refs/arc/user/test-user/errands:late-adopt"]);
    expect(record).toContain('"origin": "description"');
    expect(record).not.toContain('"originEntry"');

    const close = await runArc(["errand", "close", "late-adopt"], tmpDir);
    expect(close.exitCode).toBe(0);
    expect(await readFile(inboxPath, "utf-8")).toContain("**Link me**");
  });

  it("safely refuses a Markdown-bearing link operand for a legacy record", async () => {
    await setFullProtection(tmpDir);
    const title = "Link `arc errand` after $(capture)";
    const inboxDir = join(tmpDir, ".arc", "user", "test-user");
    const inboxPath = join(inboxDir, "USER-INBOX.md");
    const operandPath = join(tmpDir, "link-entry-title.txt");
    const inbox = `# User Inbox\n\n## Errand\n\n### \`[ ]\` **${title}**\n\n- _Observation:_ link safely.\n\n---\n`;
    await mkdir(inboxDir, { recursive: true });
    await writeFile(inboxPath, inbox, "utf-8");
    await writeFile(operandPath, `${title}\n`, "utf-8");

    await seedLegacyErrand(tmpDir, { slug: "safe-link", type: "chore" });
    const link = await runArc([
      "errand", "link", "safe-link", "--inbox-entry-file", operandPath,
    ], tmpDir);
    expect(link.exitCode).toBe(1);
    const record = await git(tmpDir, ["cat-file", "-p", "refs/arc/user/test-user/errands:safe-link"]);
    expect(record).not.toContain(`"originEntry": ${JSON.stringify(title)}`);
  });

  it("returns pure JSON errors for missing and malformed inbox link evidence", async () => {
    await setFullProtection(tmpDir);
    const inboxDir = join(tmpDir, ".arc", "user", "test-user");
    const inboxPath = join(inboxDir, "USER-INBOX.md");
    await mkdir(inboxDir, { recursive: true });
    await writeFile(
      inboxPath,
      "# User Inbox\n\n## Errand\n\n### `[ ]` **Other capture**\n\n- _Observation:_ unrelated.\n\n---\n",
      "utf-8",
    );

    const missing = await runArc([
      "errand", "link", "ghost", "--from-inbox", "Missing capture", "--json",
    ], tmpDir);
    expect(missing.exitCode).toBe(1);
    expect(JSON.parse(missing.stdout.trim())).toMatchObject({
      outcome: "error",
      operation: "errand-link",
      error: { code: "locus.errand-link.inbox" },
    });

    await writeFile(
      inboxPath,
      "# User Inbox\n\n## Errand\n\n### `[ ]` **Broken capture**\n\n"
        + "- _Disposition:_ `execute-bound`\n\n---\n",
      "utf-8",
    );
    const malformed = await runArc([
      "errand", "link", "ghost", "--from-inbox", "Broken capture", "--json",
    ], tmpDir);
    expect(malformed.exitCode).toBe(1);
    expect(JSON.parse(malformed.stdout.trim())).toMatchObject({
      outcome: "error",
      operation: "errand-link",
      error: { code: "locus.errand-link.inbox" },
    });
  });
});

async function runAnchoredSequence(commands: readonly string[][], cwd: string): Promise<{
  stdout: string;
  stderr: string;
  exitCode: number;
  results: unknown[];
}> {
  const command = commands.map((args) => args.map(shellQuote).join(" ")).join("; ");
  const interactiveCommand = `${command}; command_status=$?; exit $command_status`;
  try {
    const { stdout, stderr } = await execFileAsync(
      "script",
      ["-qec", `bash --noprofile --norc -ic ${shellQuote(interactiveCommand)}`, "/dev/null"],
      { cwd, env: { ...process.env, NO_COLOR: "1", PS1: "" } },
    );
    const normalized = normalizeAnchoredOutput(stdout);
    return { stdout: normalized, stderr, exitCode: 0, results: parseJsonLines(normalized) };
  } catch (error) {
    const failure = error as { stdout?: string; stderr?: string; code?: number | string };
    const normalized = normalizeAnchoredOutput(failure.stdout ?? "");
    return {
      stdout: normalized,
      stderr: failure.stderr ?? "",
      exitCode: typeof failure.code === "number" ? failure.code : 1,
      results: parseJsonLines(normalized),
    };
  }
}

function parseJsonLines(output: string): unknown[] {
  return output.split("\n").filter((line) => line.startsWith("{")).map((line) => JSON.parse(line));
}

function normalizeAnchoredOutput(value: string): string {
  return value.replaceAll("\r", "").split("\n").filter((line) => line !== "exit").join("\n");
}

function shellQuote(value: string): string {
  return `'${value.replaceAll("'", `'"'"'`)}'`;
}

describe("arc errand abandon", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await createTempRepo();
    const init = await runArc(["init", "--yes", "--name", "test-project"], tmpDir);
    expect(init.exitCode).toBe(0);
    await git(tmpDir, ["commit", "--allow-empty", "--no-verify", "-m", "init"]);
    await setFullProtection(tmpDir);
  });

  afterEach(async () => {
    await cleanupTempDir(tmpDir);
  });

  it("retires a preserved identity-only claim while retaining its branch", async () => {
    await seedOpenV3Errand(tmpDir, "discard");

    const result = await runArc(["errand", "abandon", "discard", "--json"], tmpDir);

    expect(result.exitCode, result.stdout + result.stderr).toBe(0);
    expect(JSON.parse(result.stdout.trim())).toMatchObject({
      outcome: "applied",
      operation: "errand-abandon",
    });
    expect(result.stderr).toBe("");
    expect(await git(tmpDir, ["branch", "--list", "chore/discard"])).toContain("chore/discard");
    await expect(git(tmpDir, ["cat-file", "-p", "refs/arc/user/test-user/errands:discard"]))
      .rejects.toThrow();
  });

  it("abandons a clean partial Errand and releases its primary occupancy", async () => {
    const remoteDir = `${tmpDir}-remote.git`;
    await execFileAsync("git", ["init", "--bare", remoteDir]);
    try {
      await setPartialProtection(tmpDir);
      await git(tmpDir, ["add", "-A"]);
      await git(tmpDir, ["commit", "--no-verify", "-m", "track initialized project"]);
      await git(tmpDir, ["remote", "add", "origin", remoteDir]);
      await git(tmpDir, ["push", "-u", "origin", "main"]);

      const result = await runAnchoredSequence([
        [process.execPath, CLI_PATH, "errand", "open", "discard-direct", "--json"],
        [process.execPath, CLI_PATH, "errand", "abandon", "discard-direct", "--json"],
      ], tmpDir);

      expect(result.exitCode, result.stdout + result.stderr).toBe(0);
      expect(result.results.at(-1)).toMatchObject({
        outcome: "applied",
        operation: "errand-abandon",
        identity: null,
        activeLocusPath: null,
      });
    } finally {
      await cleanupTempDir(remoteDir);
    }
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

  it("is no longer a registered independent identity transition", async () => {
    const result = await runArc(["errand", "retire", "anything"], tmpDir);

    expect(result.exitCode).toBe(1);
    expect(result.stdout + result.stderr).toContain("unknown command 'retire'");
  });
});

describe("arc errand leave", () => {
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

  it("refuses partial mode through the shared JSON result", async () => {
    const result = await runArc([
      "errand", "leave", "anything", "--state", "paused", "--json",
    ], tmpDir);

    expect(result.exitCode).toBe(1);
    expect(JSON.parse(result.stdout.trim())).toMatchObject({
      outcome: "refused",
      operation: "errand-leave",
      reason: "full-protection-required",
    });
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
    const result = await runArc(["errand", "promote", "anything", "--floor", "scale", "--json"], tmpDir);

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toBe("");
    expect(JSON.parse(result.stdout.trim())).toMatchObject({
      outcome: "refused",
      operation: "errand-promote",
      reason: "full-protection-required",
    });
  });

  it("requires --floor — the crossed floor is the agent's judgment", async () => {
    await setFullProtection(tmpDir);
    await seedLegacyErrand(tmpDir, { slug: "growing", type: "fix" });

    const result = await runArc(["errand", "promote", "growing", "--name", "growth"], tmpDir);

    expect(result.exitCode).toBe(1);
    // No rename happened — the errand branch survives for a retry.
    expect(await git(tmpDir, ["branch", "--list", "fix/growing"])).toContain("fix/growing");
  });

  it("refuses a derivation promotion for a legacy record before mutation", async () => {
    await setFullProtection(tmpDir);
    await seedLegacyErrand(tmpDir, { slug: "growing", type: "fix" });

    const result = await runArc(
      ["errand", "promote", "growing", "--name", "growth-feature", "--type", "feat", "--floor", "derivation"],
      tmpDir,
    );

    expect(result.exitCode).toBe(1);
    expect(await git(tmpDir, ["branch", "--list", "plan/growth-feature"])).toBe("");
    expect(await git(tmpDir, ["branch", "--list", "feat/growth-feature"])).toBe("");
    expect(await git(tmpDir, ["branch", "--list", "fix/growing"])).toContain("fix/growing");
    expect(await git(tmpDir, ["cat-file", "-p", "refs/arc/user/test-user/errands:growing"]))
      .toContain('"version": 2');
    await expect(readFile(join(tmpDir, ".arc", "active", "meta-growth-feature.md"), "utf-8")).rejects.toThrow();
  });

  it("refuses a scale promotion for a legacy record before mutation", async () => {
    await setFullProtection(tmpDir);
    await seedLegacyErrand(tmpDir, { slug: "sweeping", type: "chore" });

    const result = await runArc(
      ["errand", "promote", "sweeping", "--name", "sweep-unit", "--type", "refactor", "--floor", "scale"],
      tmpDir,
    );

    expect(result.exitCode).toBe(1);
    expect(await git(tmpDir, ["branch", "--list", "chore/sweeping"])).toContain("chore/sweeping");
    await expect(readFile(join(tmpDir, ".arc", "active", "meta-sweep-unit.md"), "utf-8")).rejects.toThrow();
  });

  it("keeps a Work Unit capture when legacy link and promotion refuse", async () => {
    await setFullProtection(tmpDir);
    const inboxDir = join(tmpDir, ".arc", "user", "test-user");
    const inboxPath = join(inboxDir, "USER-INBOX.md");
    const inbox = "# User Inbox\n\n## Work Unit\n\n### `[ ]` **Promote me**\n\n- _Observation:_ crossed a floor.\n\n---\n";
    await mkdir(inboxDir, { recursive: true });
    await writeFile(inboxPath, inbox, "utf-8");
    await seedLegacyErrand(tmpDir, { slug: "growing", type: "fix" });

    const link = await runArc(["errand", "link", "growing", "--from-inbox", "Promote me"], tmpDir);
    expect(link.exitCode).toBe(1);
    const promote = await runArc(
      ["errand", "promote", "growing", "--name", "growth-feature", "--type", "feat", "--floor", "derivation"],
      tmpDir,
    );

    expect(promote.exitCode).toBe(1);
    expect(await readFile(inboxPath, "utf-8")).toContain("**Promote me**");
  });
});
