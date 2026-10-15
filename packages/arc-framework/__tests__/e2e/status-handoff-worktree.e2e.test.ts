/** Built-CLI handoff envelopes identify primary and linked Git worktrees. */

import { execFile } from "node:child_process";
import { mkdir, realpath, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { cleanupTempDir, createTempRepo } from "./helpers.js";
import { runCli } from "../helpers/run-cli.js";

const execFileAsync = promisify(execFile);
let repository = "";

beforeEach(async () => {
  repository = await createTempRepo("arc-handoff-worktree-");
  await mkdir(join(repository, ".arc", "system"), { recursive: true });
  await writeFile(join(repository, ".arc", "system", "arc-config.yml"), [
    "branch.base: main",
    "branch.protection: partial",
    "session.remote_sync: disabled",
    "",
  ].join("\n"));
  await execFileAsync("git", ["add", ".arc"], { cwd: repository });
  await execFileAsync("git", ["commit", "-m", "initial"], { cwd: repository });
});

afterEach(async () => {
  if (repository !== "") await cleanupTempDir(repository);
  repository = "";
});

describe("handoff checkout identity", () => {
  it.each(["primary", "linked"])("names the %s checkout", async (kind) => {
    let cwd = repository;
    if (kind === "linked") {
      cwd = join(repository, "linked");
      await execFileAsync("git", ["worktree", "add", "-b", "topic", cwd], { cwd: repository });
    }

    const result = await runCli(["status", "--session-handoff", "--json"], { cwd });

    expect(result.exitCode, result.stderr).toBe(0);
    const envelope = JSON.parse(result.stdout);
    expect(envelope.mode).toBe("session-handoff");
    expect(envelope.worktree.ok).toBe(true);
    expect(envelope.worktree.value.identity).toEqual(kind === "linked"
      ? { kind: "linked", path: await realpath(cwd) }
      : { kind: "primary" });
    expect(envelope.branch).toBe(kind === "linked" ? "topic" : "main");
  });
});
