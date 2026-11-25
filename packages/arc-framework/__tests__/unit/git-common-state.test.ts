/** Repository-common state publication resolves the Git common directory once per publisher. */

import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { GitExec } from "../../src/lib/git/exec.js";
import { RepositoryGitCommonStatePublisher, type GitCommonStateLocation } from "../../src/lib/git-common-state.js";

const location: GitCommonStateLocation = { root: "delivery", namespace: "state" };

let commonDir: string;
beforeEach(async () => { commonDir = await mkdtemp(join(tmpdir(), "arc-common-state-")); });
afterEach(async () => { await rm(commonDir, { recursive: true, force: true }); });

function countingExec(answers: ReadonlyArray<() => string>): { exec: GitExec; calls: string[][] } {
  const calls: string[][] = [];
  const exec: GitExec = async (_cmd, args) => {
    calls.push(args);
    const answer = answers[Math.min(calls.length, answers.length) - 1]!;
    return { stdout: answer() };
  };
  return { exec, calls };
}

describe("RepositoryGitCommonStatePublisher", () => {
  it("asks Git for the common directory once across its reads and writes", async () => {
    const { exec, calls } = countingExec([() => commonDir]);
    const publisher = new RepositoryGitCommonStatePublisher(exec, "/checkout");
    await publisher.update(location, "one.json", () => ({ kind: "write", content: "{}", result: null }));
    expect(await publisher.read(location, "one.json")).toBe("{}");
    expect(await publisher.list(location)).toEqual([{ name: "one.json", kind: "file" }]);
    expect(await publisher.snapshot(location)).toEqual([{ name: "one.json", kind: "file", content: "{}" }]);
    expect(calls).toEqual([["rev-parse", "--git-common-dir"]]);
  });

  it("asks again after a failed resolution instead of keeping the failure", async () => {
    const failure = new Error("not a git repository");
    const { exec, calls } = countingExec([() => { throw failure; }, () => commonDir]);
    const publisher = new RepositoryGitCommonStatePublisher(exec, "/checkout");
    await expect(publisher.read(location, "one.json")).rejects.toBe(failure);
    expect(await publisher.read(location, "one.json")).toBeNull();
    expect(await publisher.read(location, "two.json")).toBeNull();
    expect(calls).toHaveLength(2);
  });
});
