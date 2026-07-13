/** Real-Git coverage for strict local-exclusive notes-history reads. */

import { afterEach, describe, expect, it } from "vitest";

import {
  cleanupTempDir,
  createTempRepo,
  makeGitExec,
  makeNotesTreeCommit,
} from "../helpers/integration.js";
import { readLocalExclusiveAnnotatedNoteCommits } from "../../src/lib/user-sync/notes-ref.js";

const oid = (seed: string): string => seed.padEnd(40, "0");
const oid256 = (seed: string): string => seed.padEnd(64, "0");
const fanoutPath = (commit: string): string => `${commit.slice(0, 2)}/${commit.slice(2)}`;

describe("notes publication history", () => {
  let repo: string | undefined;

  afterEach(async () => {
    if (repo !== undefined) await cleanupTempDir(repo);
    repo = undefined;
  });

  it("collects root and snapshot paths even when a later tree removes a note", async () => {
    repo = await createTempRepo("arc-notes-publication-history-root-");
    const removed = oid("a1");
    const retained = oid256("b2");
    const root = await makeNotesTreeCommit(repo, [
      { commit: removed, content: "removed later" },
      { commit: retained, content: "retained" },
    ], { message: "snapshot root" });
    const deletion = await makeNotesTreeCommit(repo, [
      { commit: retained, content: "retained" },
    ], { message: "remove note", parents: [root.tip] });

    await expect(readLocalExclusiveAnnotatedNoteCommits(makeGitExec(repo), deletion.tip, null))
      .resolves.toEqual(new Set([removed, retained]));
  });

  it("collects publication paths exposed by each merge parent", async () => {
    repo = await createTempRepo("arc-notes-publication-history-merge-");
    const leftCommit = oid("a1");
    const rightCommit = oid("b2");
    const left = await makeNotesTreeCommit(repo, [
      { commit: leftCommit, content: "left" },
    ], { message: "left root" });
    const right = await makeNotesTreeCommit(repo, [
      { commit: rightCommit, content: "right" },
    ], { message: "right root" });
    const merge = await makeNotesTreeCommit(repo, [
      { commit: leftCommit, content: "left" },
      { commit: rightCommit, content: "right" },
    ], { message: "merge histories", parents: [left.tip, right.tip] });

    await expect(readLocalExclusiveAnnotatedNoteCommits(makeGitExec(repo), merge.tip, null))
      .resolves.toEqual(new Set([leftCommit, rightCommit]));
  });

  it("ignores fanout-only renames but collects same-blob cross-commit moves", async () => {
    repo = await createTempRepo("arc-notes-publication-history-renames-");
    const source = oid("a1");
    const destination = oid("b2");
    const root = await makeNotesTreeCommit(repo, [
      { commit: source, content: "shared blob" },
    ], { message: "flat note" });
    const fanout = await makeNotesTreeCommit(repo, [
      { commit: source, content: "shared blob", path: fanoutPath(source) },
    ], { message: "fanout note", parents: [root.tip] });
    const moved = await makeNotesTreeCommit(repo, [
      { commit: destination, content: "shared blob" },
    ], { message: "move note", parents: [fanout.tip] });

    await expect(readLocalExclusiveAnnotatedNoteCommits(makeGitExec(repo), moved.tip, root.tip))
      .resolves.toEqual(new Set([destination]));
  });

  it("rejects malformed tree paths and Git history failures", async () => {
    repo = await createTempRepo("arc-notes-publication-history-failure-");
    const malformed = await makeNotesTreeCommit(repo, [
      { commit: oid("a1"), content: "malformed", path: "README.md" },
    ], { message: "malformed path" });

    await expect(readLocalExclusiveAnnotatedNoteCommits(makeGitExec(repo), malformed.tip, null))
      .rejects.toThrow("Malformed notes-history path");
    await expect(readLocalExclusiveAnnotatedNoteCommits(makeGitExec(repo), oid("ff"), null))
      .rejects.toThrow();
  });
});
