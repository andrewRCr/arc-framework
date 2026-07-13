/** Real-Git publication proof across live remote branch histories. */

import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

import { afterEach, describe, expect, it } from "vitest";

import {
  addBareRemote,
  cleanupTempDir,
  createTempRepo,
  execFileAsync,
  makeCommit,
  makeGitExec,
  makeGitExecInput,
} from "../helpers/integration.js";
import { proveNotesPublication } from "../../src/lib/user-sync/notes-publication-proof.js";

async function git(cwd: string, args: string[]): Promise<string> {
  const { stdout } = await execFileAsync("git", args, { cwd });
  return stdout.trim();
}

describe("notes publication proof", () => {
  const cleanup = new Set<string>();

  afterEach(async () => {
    await Promise.all([...cleanup].map((path) => cleanupTempDir(path)));
    cleanup.clear();
  });

  it("accepts the just-pushed branch and a locally available sibling live head", async () => {
    const repo = await createTempRepo("arc-notes-proof-live-");
    cleanup.add(repo);
    const base = await makeCommit(repo, "base");
    const remote = await addBareRemote(repo);
    cleanup.add(remote);

    await git(repo, ["checkout", "-b", "feat/sibling"]);
    const sibling = await makeCommit(repo, "sibling");
    await git(repo, ["push", "-u", "origin", "feat/sibling"]);
    await git(repo, ["checkout", "main"]);

    const input = { exec: makeGitExec(repo), execInput: makeGitExecInput(repo) };
    await expect(proveNotesPublication({ ...input, annotatedCommits: [base] }))
      .resolves.toEqual({ kind: "proven" });
    await expect(proveNotesPublication({ ...input, annotatedCommits: [sibling] }))
      .resolves.toEqual({ kind: "proven" });
  });

  it("does not let a stale remote-tracking ref prove publication", async () => {
    const repo = await createTempRepo("arc-notes-proof-stale-");
    cleanup.add(repo);
    await makeCommit(repo, "base");
    const remote = await addBareRemote(repo);
    cleanup.add(remote);

    await git(repo, ["checkout", "-b", "feat/removed"]);
    const removed = await makeCommit(repo, "removed branch");
    await git(repo, ["push", "-u", "origin", "feat/removed"]);
    await git(remote, ["update-ref", "-d", "refs/heads/feat/removed"]);
    await git(repo, ["checkout", "main"]);

    await expect(proveNotesPublication({
      exec: makeGitExec(repo),
      execInput: makeGitExecInput(repo),
      annotatedCommits: [removed],
    })).resolves.toEqual({ kind: "unpublished", commits: [removed] });
  });

  it("proves visible shallow history but refuses to classify beyond its boundary", async () => {
    const source = await createTempRepo("arc-notes-proof-source-");
    cleanup.add(source);
    const older = await makeCommit(source, "older");
    const remote = await addBareRemote(source);
    cleanup.add(remote);
    const visible = await makeCommit(source, "visible");
    await git(source, ["push", "origin", "main"]);

    const shallow = await mkdtemp(join(tmpdir(), "arc-notes-proof-shallow-"));
    cleanup.add(shallow);
    await execFileAsync("git", ["clone", "--depth=1", pathToFileURL(remote).href, shallow]);
    const input = { exec: makeGitExec(shallow), execInput: makeGitExecInput(shallow) };

    await expect(proveNotesPublication({ ...input, annotatedCommits: [visible] }))
      .resolves.toEqual({ kind: "proven" });
    await expect(proveNotesPublication({ ...input, annotatedCommits: [older] }))
      .resolves.toMatchObject({ kind: "unavailable", message: expect.stringContaining("shallow") });
  });
});
