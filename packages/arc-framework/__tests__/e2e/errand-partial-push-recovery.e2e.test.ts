/** Partial Errand preservation while a baseline push gate needs repair. */

import { execFile } from "node:child_process";
import { chmod, mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";
import { afterEach, expect, it } from "vitest";

import { readWorktreeMarker } from "../../src/lib/git/worktree-marker.js";
import { initializedRepository } from "../helpers/initialized-repository.js";
import { cleanupTempDir, git, runArcAnchored } from "./helpers.js";

const execFileAsync = promisify(execFile);
const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map(cleanupTempDir)); });

it("retains an unpublished partial Errand through a red baseline gate and closes after normal publication", async () => {
  const cwd = await initializedRepository("initialized-and-committed");
  const remote = `${cwd}-remote.git`;
  roots.push(cwd, remote);
  await git(cwd, ["add", "-A"]);
  await git(cwd, ["commit", "--allow-empty", "-m", "test: initialized partial project"]);
  await execFileAsync("git", ["init", "--bare", "--initial-branch=main", remote]);
  await git(cwd, ["remote", "add", "origin", remote]);
  await execFileAsync("git", ["push", "-u", "origin", "main"], { cwd });

  const hooks = join(remote, "fixture-hooks");
  await mkdir(hooks);
  const prePush = join(hooks, "pre-push");
  await writeFile(prePush, "#!/bin/sh\n"
    + "if ! git cat-file -e HEAD:push-gate-fixed.txt 2>/dev/null; then\n"
    + "  echo 'fixture push gate already fails on base' >&2\n  exit 1\nfi\n");
  await chmod(prePush, 0o755);
  await git(cwd, ["config", "core.hooksPath", hooks]);
  const push = () => execFileAsync("git", ["push", "origin", "main"], { cwd });
  await expect(push()).rejects.toMatchObject({ stderr: expect.stringContaining("already fails on base") });

  const title = "Apply the direct fix";
  const inbox = join(cwd, ".arc", "user", "test-user", "USER-INBOX.md");
  await mkdir(join(cwd, ".arc", "user", "test-user"), { recursive: true });
  await writeFile(inbox, `# User Inbox\n\n## Errand\n\n### \`[ ]\` **${title}**\n\n`
    + "- _Disposition:_ `execute-bound`\n\n---\n");
  const opened = await runArcAnchored(["errand", "open", "direct-fix", "--from-inbox", title, "--json"], cwd);
  expect(opened.exitCode, opened.stdout + opened.stderr).toBe(0);
  const marker = await readWorktreeMarker(cwd);
  expect(marker).toMatchObject({ kind: "present" });
  const captured = await readFile(inbox, "utf8");
  await writeFile(join(cwd, "direct-fix.txt"), "the atomic change\n");
  await git(cwd, ["add", "direct-fix.txt"]);
  await git(cwd, ["commit", "-m", "fix: direct change"]);
  const originalHead = await git(cwd, ["rev-parse", "HEAD"]);
  await expect(push()).rejects.toMatchObject({ stderr: expect.stringContaining("already fails on base") });

  await git(cwd, ["switch", "-c", "side-branch"]);
  const offBranch = await runArcAnchored(["errand", "close", "direct-fix", "--json"], cwd);
  expect(offBranch.exitCode, offBranch.stdout + offBranch.stderr).toBe(1);
  expect(JSON.parse(offBranch.stdout.trim())).toMatchObject({ outcome: "refused", reason: "preservation-unproven",
    recommendedPromptText: expect.stringMatching(/return.*main/iu) });
  expect(await readWorktreeMarker(cwd)).toEqual(marker);
  expect(await readFile(inbox, "utf8")).toBe(captured);
  await git(cwd, ["switch", "main"]);

  const refused = await runArcAnchored(["errand", "close", "direct-fix", "--json"], cwd);
  expect(refused.exitCode, refused.stdout + refused.stderr).toBe(1);
  const result: unknown = JSON.parse(refused.stdout.trim());
  expect(result).toMatchObject({ outcome: "refused", reason: "preservation-unproven",
    recommendedPromptText: expect.stringMatching(/push.*origin.*main/iu) });
  expect(result).toMatchObject({ recommendedPromptText: expect.stringMatching(/supported.*environment|supported.*runtime/iu) });
  expect(result).toMatchObject({ recommendedPromptText: expect.stringMatching(/Owner.*repair|Owner.*fix/iu) });
  expect(await readWorktreeMarker(cwd)).toEqual(marker);
  expect(await readFile(inbox, "utf8")).toBe(captured);

  await writeFile(join(cwd, "push-gate-fixed.txt"), "the prerequisite gate repair\n");
  await git(cwd, ["add", "push-gate-fixed.txt"]);
  await git(cwd, ["commit", "-m", "fix: prerequisite push gate"]);
  expect(await git(cwd, ["rev-parse", "HEAD~1"])).toBe(originalHead);
  expect(await readWorktreeMarker(cwd)).toEqual(marker);
  expect(await readFile(inbox, "utf8")).toBe(captured);
  await push();
  expect((await execFileAsync("git", ["--git-dir", remote, "rev-parse", "refs/heads/main"])).stdout.trim())
    .toBe(await git(cwd, ["rev-parse", "HEAD"]));
  const settled = await runArcAnchored(["errand", "close", "direct-fix", "--json"], cwd);
  expect(settled.exitCode, settled.stdout + settled.stderr).toBe(0);
  expect(JSON.parse(settled.stdout.trim())).toMatchObject({ outcome: "applied", operation: "errand-close",
    settlement: { kind: "capture", disposition: "removed" } });
  expect(await readWorktreeMarker(cwd)).toEqual({ kind: "absent" });
  expect(await readFile(inbox, "utf8")).not.toContain(title);
}, 60_000);
