import { describe, it, expect } from "vitest";

import { deriveRestateCandidates } from "../../../src/lib/handoff/restate-candidates.js";
import type { ExecResult } from "../../../src/lib/git/index.js";
import { scriptGitExec } from "../../helpers/git-exec-fake.js";

function buildExec(
  responses: Record<string, ExecResult | { failure: { exitCode: number; stderr: string } }>,
): ReturnType<typeof scriptGitExec> {
  return scriptGitExec(Object.entries(responses).map(([key, response]) => ({
    match: {
      predicate: (args: readonly string[]) => key.split(" ").every((token, i) => token === "*" || args[i] === token),
    },
    responses: [response],
  })));
}

const BASELINE = "372b654e";
const RANGE = `${BASELINE}..HEAD`;
const LOG_KEY = `log -z ${RANGE} *`;
const DIFF_KEY = `diff --name-only ${RANGE}`;

const COMMIT_SEP = "\u0000";

function commitRecord(hash: string, subject: string, body: string): string {
  return `${hash}\n${subject}\n${body}${COMMIT_SEP}`;
}

function notes(baselineLine: string): string {
  return `# Session Notes\n\n## Handoff Metadata\n\n${baselineLine}\n`;
}

describe("deriveRestateCandidates", () => {
  it("returns commits between Commit at Handoff and HEAD with hash + subject", async () => {
    const sessionNotes = notes("**Commit at Handoff:** `372b654e`");
    const logStdout =
      commitRecord("abc1234", "docs(arc): first", "docs(arc): first\n") +
      commitRecord("def5678", "feat(x): second", "feat(x): second\n");
    const { exec } = buildExec({
      [LOG_KEY]: { stdout: logStdout, stderr: "" },
      [DIFF_KEY]: { stdout: "", stderr: "" },
    });

    const result = await deriveRestateCandidates({ exec, sessionNotes });

    expect(result.commitsSinceHandoff).toEqual([
      { hash: "abc1234", subject: "docs(arc): first" },
      { hash: "def5678", subject: "feat(x): second" },
    ]);
    expect(result.baselineSignal).toBeUndefined();
  });

  it("returns empty arrays without a soft signal when HEAD matches the baseline", async () => {
    const sessionNotes = notes("**Commit at Handoff:** `372b654e`");
    const { exec } = buildExec({
      [LOG_KEY]: { stdout: "", stderr: "" },
      [DIFF_KEY]: { stdout: "", stderr: "" },
    });

    const result = await deriveRestateCandidates({ exec, sessionNotes });

    expect(result.commitsSinceHandoff).toEqual([]);
    expect(result.tasksClosedSinceHandoff).toEqual([]);
    expect(result.noteFileChangesSinceHandoff).toEqual([]);
    expect(result.baselineSignal).toBeUndefined();
  });

  it("extracts single task IDs from Context: footers", async () => {
    const sessionNotes = notes("**Commit at Handoff:** `372b654e`");
    const logStdout =
      commitRecord(
        "abc1234",
        "feat(x): one",
        "feat(x): one\n\nContext: tasks-foo.md (Task 4.2)\n",
      ) +
      commitRecord(
        "def5678",
        "feat(x): two",
        "feat(x): two\n\nContext: tasks-foo.md (Task 4.2.a)\n",
      ) +
      commitRecord(
        "ghi9abc",
        "feat(x): three",
        "feat(x): three\n\nContext: tasks-foo.md (Task 4.2.R)\n",
      );
    const { exec } = buildExec({
      [LOG_KEY]: { stdout: logStdout, stderr: "" },
      [DIFF_KEY]: { stdout: "", stderr: "" },
    });

    const result = await deriveRestateCandidates({ exec, sessionNotes });

    expect(result.tasksClosedSinceHandoff).toEqual(["4.2", "4.2.a", "4.2.R"]);
  });

  it("extracts range and comma-list patterns as raw strings", async () => {
    const sessionNotes = notes("**Commit at Handoff:** `372b654e`");
    const logStdout =
      commitRecord(
        "aaa1111",
        "feat(x): range",
        "feat(x): range\n\nContext: tasks-foo.md (Tasks 4.2-4.5)\n",
      ) +
      commitRecord(
        "bbb2222",
        "feat(x): list",
        "feat(x): list\n\nContext: tasks-foo.md (Tasks 6.1.h, 6.2.a-d)\n",
      ) +
      commitRecord(
        "ccc3333",
        "fix(x): nested",
        "fix(x): nested\n\nContext: tasks-foo.md (incidental - discovered during Task 4.3)\n",
      );
    const { exec } = buildExec({
      [LOG_KEY]: { stdout: logStdout, stderr: "" },
      [DIFF_KEY]: { stdout: "", stderr: "" },
    });

    const result = await deriveRestateCandidates({ exec, sessionNotes });

    expect(result.tasksClosedSinceHandoff).toEqual([
      "4.2-4.5",
      "6.1.h",
      "6.2.a-d",
      "4.3",
    ]);
  });

  it("returns notes-*.md paths touched in the range, ignoring other file changes", async () => {
    const sessionNotes = notes("**Commit at Handoff:** `372b654e`");
    const logStdout = commitRecord("abc1234", "feat(x): one", "feat(x): one\n");
    const diffStdout = [
      ".arc/active/technical/notes-user-sync-ux.md",
      ".arc/active/technical/tasks-user-sync-ux.md",
      "packages/arc-framework/src/lib/foo.ts",
      ".arc/user/andrew/notes-personal.md",
      "README.md",
    ].join("\n");
    const { exec } = buildExec({
      [LOG_KEY]: { stdout: logStdout, stderr: "" },
      [DIFF_KEY]: { stdout: diffStdout, stderr: "" },
    });

    const result = await deriveRestateCandidates({ exec, sessionNotes });

    expect(result.noteFileChangesSinceHandoff).toEqual([
      ".arc/active/technical/notes-user-sync-ux.md",
      ".arc/user/andrew/notes-personal.md",
    ]);
  });

  it("returns empty arrays + baseline-unknown when SESSION-NOTES is absent", async () => {
    const { exec, calls } = buildExec({});

    const result = await deriveRestateCandidates({ exec, sessionNotes: null });

    expect(result).toEqual({
      commitsSinceHandoff: [],
      tasksClosedSinceHandoff: [],
      noteFileChangesSinceHandoff: [],
      baselineSignal: "baseline-unknown",
    });
    expect(calls).toEqual([]);
  });

  it("returns empty arrays + baseline-unknown when the baseline hash is missing from SESSION-NOTES", async () => {
    const sessionNotes = "# Session Notes\n\nNo handoff metadata yet.\n";
    const { exec, calls } = buildExec({});

    const result = await deriveRestateCandidates({ exec, sessionNotes });

    expect(result).toEqual({
      commitsSinceHandoff: [],
      tasksClosedSinceHandoff: [],
      noteFileChangesSinceHandoff: [],
      baselineSignal: "baseline-unknown",
    });
    expect(calls).toEqual([]);
  });

  it("returns empty arrays + baseline-unknown when the baseline commit is unreachable from HEAD", async () => {
    const sessionNotes = notes("**Commit at Handoff:** `372b654e`");
    const { exec } = buildExec({
      [LOG_KEY]: { failure: { exitCode: 128, stderr: "fatal: bad revision '372b654e..HEAD'" } },
      [DIFF_KEY]: { stdout: "", stderr: "" },
    });

    const result = await deriveRestateCandidates({ exec, sessionNotes });

    expect(result).toEqual({
      commitsSinceHandoff: [],
      tasksClosedSinceHandoff: [],
      noteFileChangesSinceHandoff: [],
      baselineSignal: "baseline-unknown",
    });
  });
});
