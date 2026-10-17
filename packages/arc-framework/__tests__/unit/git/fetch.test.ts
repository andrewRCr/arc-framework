import { describe, expect, it } from "vitest";

import { parseFetchPorcelain } from "../../../src/lib/git/fetch.js";
import { makeGitProcessError } from "../../helpers/git-exec-fake.js";
import recordings from "../../fixtures/store/fetch-porcelain.json";

// Unmodified stdout from Git 2.55 fetching between disposable local bare repositories.
describe("fetch porcelain", () => {
  it.each(recordings.records)("preserves the $scenario update and both tips", (recording) => {
    const expected = {
      new: ["*", "0000000000000000000000000000000000000000", "7d45eb16e903e3baaa0329366cce903213eaceaf"],
      unchanged: ["=", "7d45eb16e903e3baaa0329366cce903213eaceaf", "7d45eb16e903e3baaa0329366cce903213eaceaf"],
      "fast-forward": [" ", "7d45eb16e903e3baaa0329366cce903213eaceaf", "4c5154f05545e5963dd0e38ac3a96cc1cc739436"],
      refused: ["!", "4c5154f05545e5963dd0e38ac3a96cc1cc739436", "2dea9cf5238fa3e535f71b1429bdb0530f18e447"],
      forced: ["+", "4c5154f05545e5963dd0e38ac3a96cc1cc739436", "2dea9cf5238fa3e535f71b1429bdb0530f18e447"],
      pruned: ["-", "2dea9cf5238fa3e535f71b1429bdb0530f18e447", "0000000000000000000000000000000000000000"],
    }[recording.scenario];
    expect(expected).toBeDefined();
    expect(parseFetchPorcelain(recording)).toEqual({
      status: "refs", refs: [{ flag: expected![0], old: expected![1], next: expected![2], ref: "refs/heads/example" }],
      stdout: recording.stdout, stderr: recording.stderr,
    });
  });
});

describe("fetch process failure", () => {
  it.each([
    ["fatal: Could not resolve host: example.test", "network"],
    ["fatal: Authentication failed", "auth"],
    ["fatal: unable to access the remote", "error"],
  ])("classifies rowless failure: %s", (stderr, cause) => {
    const error = makeGitProcessError({ command: "git", args: ["fetch", "--porcelain"], exitCode: 1,
      stdout: "", stderr });
    expect(parseFetchPorcelain(error)).toEqual({ status: "unreachable", cause, stdout: "", stderr });
  });
});

it("reads exit-1 stdout before interpreting a competing diagnostic", () => {
  const recording = recordings.records.find((row) => row.scenario === "refused")!;
  const stderr = "fatal: Authentication failed";
  const error = makeGitProcessError({ command: "git", args: recording.args, exitCode: 1,
    stdout: recording.stdout, stderr });
  expect(parseFetchPorcelain(error)).toEqual({
    status: "refs", refs: [{ flag: "!", old: "4c5154f05545e5963dd0e38ac3a96cc1cc739436",
      next: "2dea9cf5238fa3e535f71b1429bdb0530f18e447", ref: "refs/heads/example" }],
    stdout: recording.stdout, stderr,
  });
});
