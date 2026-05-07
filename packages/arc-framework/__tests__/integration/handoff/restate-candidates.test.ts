/**
 * Integration coverage for `deriveRestateCandidates` against a real git repo.
 *
 * Locks the lib helper's exec boundary — unit tests mock `GitExec` and so
 * couldn't catch the regression where a literal NUL in the `git log --format`
 * argument was rejected by Node's `child_process.execFile`. Each test commits
 * real messages and runs the helper end-to-end with a real exec.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";

import {
  createTempRepo,
  cleanupTempDir,
  makeGitExec,
  makeCommit,
} from "../../helpers/integration.js";
import { deriveRestateCandidates } from "../../../src/lib/handoff/restate-candidates.js";
import type { GitExec } from "../../../src/lib/git/index.js";

let tempDir: string;
let exec: GitExec;

function notesWithBaseline(baseline: string): string {
  return `# Session Notes\n\n## Handoff Metadata\n\n**Commit at Handoff:** \`${baseline}\`\n`;
}

describe("deriveRestateCandidates integration", () => {
  beforeEach(async () => {
    tempDir = await createTempRepo("arc-restate-cand-");
    exec = makeGitExec(tempDir);
  });

  afterEach(async () => {
    await cleanupTempDir(tempDir);
  });

  it("returns commits since the SESSION-NOTES baseline against a real repo", async () => {
    const baseline = await makeCommit(tempDir, "chore(seed): baseline");
    await makeCommit(tempDir, "feat(x): first since baseline");
    await makeCommit(tempDir, "feat(x): second since baseline");

    const result = await deriveRestateCandidates({
      exec,
      sessionNotes: notesWithBaseline(baseline),
    });

    expect(result.baselineSignal).toBeUndefined();
    expect(result.commitsSinceHandoff.map((c) => c.subject)).toEqual([
      "feat(x): second since baseline",
      "feat(x): first since baseline",
    ]);
    expect(result.commitsSinceHandoff[0]?.hash).toMatch(/^[0-9a-f]{7,}$/u);
  });

  it("round-trips subjects with tabs/quotes and multi-line bodies through the format string", async () => {
    const baseline = await makeCommit(tempDir, "chore(seed): baseline");
    const subject = `feat(x): "quoted"\tand\ttabbed`;
    await makeCommit(
      tempDir,
      [subject, "", "Body line 1.", "Body line 2.", "Body line 3."].join("\n"),
    );

    const result = await deriveRestateCandidates({
      exec,
      sessionNotes: notesWithBaseline(baseline),
    });

    expect(result.baselineSignal).toBeUndefined();
    expect(result.commitsSinceHandoff).toHaveLength(1);
    expect(result.commitsSinceHandoff[0]?.subject).toBe(subject);
  });

  it("parses range and comma-list Context: footers from real commit bodies", async () => {
    const baseline = await makeCommit(tempDir, "chore(seed): baseline");
    await makeCommit(
      tempDir,
      [
        "feat(x): batched range",
        "",
        "Body paragraph for the ranged commit.",
        "",
        "Context: tasks-foo.md (Tasks 4.2-4.5)",
      ].join("\n"),
    );
    await makeCommit(
      tempDir,
      [
        "feat(x): comma list",
        "",
        "Context: tasks-foo.md (Tasks 6.1.h, 6.2.a-d)",
      ].join("\n"),
    );

    const result = await deriveRestateCandidates({
      exec,
      sessionNotes: notesWithBaseline(baseline),
    });

    expect(result.baselineSignal).toBeUndefined();
    expect(result.tasksClosedSinceHandoff).toEqual([
      "6.1.h",
      "6.2.a-d",
      "4.2-4.5",
    ]);
  });

  it("returns baseline-unknown when the baseline commit is not reachable from HEAD", async () => {
    await makeCommit(tempDir, "chore(seed): on this branch");
    const fakeBaseline = "deadbeefdeadbeefdeadbeefdeadbeefdeadbeef";

    const result = await deriveRestateCandidates({
      exec,
      sessionNotes: notesWithBaseline(fakeBaseline),
    });

    expect(result).toEqual({
      commitsSinceHandoff: [],
      tasksClosedSinceHandoff: [],
      noteFileChangesSinceHandoff: [],
      baselineSignal: "baseline-unknown",
    });
  });
});
