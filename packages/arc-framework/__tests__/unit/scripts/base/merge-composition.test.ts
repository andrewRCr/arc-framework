/** Production base-merge cleanup behavior at the Git boundary. */

import { describe, expect, it } from "vitest";
import { makeGitProcessError, scriptGitExec } from "../../../helpers/git-exec-fake.js";

import type { ExecResult, GitExec } from "../../../../src/lib/git/exec.js";
import { createBaseMergePort } from "../../../../src/scripts/base/merge-composition.js";
import { mergeExpectedBase } from "../../../../src/scripts/base/merge.js";

const oid = (character: string): string => character.repeat(40);

describe("base merge composition", () => {
  it("creates a merge commit only with the exact guarded divergence arguments", async () => {
    const state = { head: oid("c") };
    const ok = (stdout = ""): ExecResult => ({ stdout, stderr: "" });
    const exec: GitExec = async (_command, args) => {
      if (args[0] === "status") return ok();
      if (args[0] === "rev-parse" && args.at(-1) === "HEAD") return ok(state.head);
      if (args[0] === "rev-parse" && args.at(-1) === "MERGE_HEAD") {
        throw makeGitProcessError({ command: "git", args, exitCode: 128, stderr: "no merge" });
      }
      if (args[0] === "merge" && args.join(" ") === `merge --no-ff --no-edit ${oid("a")}`) {
        state.head = oid("d");
        return ok();
      }
      if (args[0] === "rev-list") return ok(`${state.head} ${oid("c")} ${oid("a")}\n`);
      throw new Error(`unexpected Git invocation: ${args.join(" ")}`);
    };
    const port = createBaseMergePort({ cwd: "/repo", baseBranch: "main", exec });
    await expect(port.mergeAppendOnly(oid("a"), oid("c"))).resolves.toEqual({
      status: "merged",
      headOid: oid("d"),
    });
    expect(state.head).toBe(oid("d"));
  });

  it("removes only an unexpected merge proven to start at the guarded head", async () => {
    const state = { head: oid("c"), clean: true };
    const updates: string[][] = [];
    const resets: string[][] = [];
    const ok = (stdout = ""): ExecResult => ({ stdout, stderr: "" });
    const exec: GitExec = async (_command, args) => {
      if (args[0] === "status") return ok(state.clean ? "" : " M merged.txt");
      if (args[0] === "rev-parse" && args.at(-1) === "HEAD") return ok(state.head);
      if (args[0] === "merge") {
        state.head = oid("d");
        return ok();
      }
      if (args[0] === "rev-list") return ok(`${state.head} ${oid("c")} ${oid("e")}\n`);
      if (args[0] === "update-ref") {
        updates.push([...args]);
        expect(args).toEqual(["update-ref", "HEAD", oid("c"), oid("d")]);
        state.head = oid("c");
        state.clean = false;
        return ok();
      }
      if (args[0] === "reset") {
        resets.push([...args]);
        state.clean = true;
        return ok();
      }
      throw new Error(`unexpected Git invocation: ${args.join(" ")}`);
    };

    await expect(createBaseMergePort({ cwd: "/repo", baseBranch: "main", exec })
      .mergeAppendOnly(oid("a"), oid("c")))
      .rejects.toThrow("Git created a merge commit with unexpected parents.");
    expect(state).toEqual({ head: oid("c"), clean: true });
    expect(updates).toHaveLength(1);
    expect(resets).toEqual([["reset", "--hard", "HEAD"]]);
  });

  it("does not reset a foreign commit that advances HEAD after the merge", async () => {
    const state = { head: oid("c") };
    const mutations: string[][] = [];
    const ok = (stdout = ""): ExecResult => ({ stdout, stderr: "" });
    const exec: GitExec = async (_command, args) => {
      if (args[0] === "status") return ok();
      if (args[0] === "rev-parse" && args.at(-1) === "HEAD") return ok(state.head);
      if (args[0] === "merge") {
        state.head = oid("d");
        state.head = oid("e");
        return ok();
      }
      if (args[0] === "rev-list") return ok(`${state.head} ${oid("d")}\n`);
      if (args[0] === "update-ref" || args[0] === "reset") {
        mutations.push([...args]);
        return ok();
      }
      if (args[0] === "rev-parse" && args.at(-1) === "MERGE_HEAD") {
        throw makeGitProcessError({ command: "git", args, exitCode: 128, stderr: "no merge" });
      }
      throw new Error(`unexpected Git invocation: ${args.join(" ")}`);
    };

    await expect(createBaseMergePort({ cwd: "/repo", baseBranch: "main", exec })
      .mergeAppendOnly(oid("a"), oid("c")))
      .rejects.toThrow("Git created a merge commit with unexpected parents.");
    expect(state.head).toBe(oid("e"));
    expect(mutations).toEqual([]);
  });

  it("turns a bounded fetch timeout into a typed operational refusal", async () => {
    const { exec } = scriptGitExec([
      { match: { prefix: ["check-ref-format"] }, responses: [{ stdout: "" }] },
      { match: { prefix: ["fetch"] }, responses: [async ({ options }) => {
        await new Promise<void>((resolve) => {
          options?.signal?.addEventListener("abort", () => { resolve(); }, { once: true });
        });
        return { failure: { isCanceled: true, stderr: "aborted" } };
      }] },
    ]);

    await expect(mergeExpectedBase(
      { expectedBase: oid("a"), expectedHead: oid("c") },
      createBaseMergePort({ cwd: "/repo", baseBranch: "main", exec, fetchTimeoutMs: 1 }),
    )).resolves.toMatchObject({
      state: "blocked",
      reason: "operational-failure",
      detail: "Fetching the configured base timed out.",
    });
  });

  it("aborts a conflicting merge before exposing the conflict verdict", async () => {
    const state = { head: oid("c"), clean: true, merging: false };
    const ok = (stdout = ""): ExecResult => ({ stdout, stderr: "" });
    const exec: GitExec = async (_command, args) => {
      if (args[0] === "status") return ok(state.clean ? "" : "UU conflict.txt");
      if (args[0] === "rev-parse" && args.at(-1) === "HEAD") return ok(state.head);
      if (args[0] === "rev-parse" && args.at(-1) === "MERGE_HEAD") {
        if (!state.merging) {
          throw makeGitProcessError({ command: "git", args, exitCode: 128, stderr: "no merge" });
        }
        return ok(oid("a"));
      }
      if (args[0] === "merge" && args[1] === "--no-ff" && args[2] === "--no-edit") {
        state.clean = false;
        state.merging = true;
        throw makeGitProcessError({ command: "git", args, exitCode: 1, stderr: "conflict" });
      }
      if (args[0] === "merge" && args[1] === "--abort") {
        state.clean = true;
        state.merging = false;
        return ok();
      }
      if (args[0] === "diff" && args.includes("--diff-filter=U")) return ok("conflict.txt\n");
      throw new Error(`unexpected Git invocation: ${args.join(" ")}`);
    };
    const port = createBaseMergePort({ cwd: "/repo", baseBranch: "main", exec });

    await expect(port.mergeAppendOnly(oid("a"), oid("c"))).resolves.toEqual({
      status: "conflict",
      detail: "Merge conflicts remain in: conflict.txt.",
    });
    expect(state).toEqual({ head: oid("c"), clean: true, merging: false });
  });

  it("restores the repository but preserves a non-conflict merge failure", async () => {
    const state = { head: oid("c"), clean: true, merging: false };
    const failure = makeGitProcessError({
      command: "git",
      args: ["merge", "--no-ff", "--no-edit", oid("a")],
      exitCode: 1,
      stderr: "commit hook rejected the merge",
    });
    const ok = (stdout = ""): ExecResult => ({ stdout, stderr: "" });
    const exec: GitExec = async (_command, args) => {
      if (args[0] === "status") return ok(state.clean ? "" : "merge state");
      if (args[0] === "rev-parse" && args.at(-1) === "HEAD") return ok(state.head);
      if (args[0] === "rev-parse" && args.at(-1) === "MERGE_HEAD") {
        if (!state.merging) {
          throw makeGitProcessError({ command: "git", args, exitCode: 128, stderr: "no merge" });
        }
        return ok(oid("a"));
      }
      if (args[0] === "merge" && args[1] === "--no-ff" && args[2] === "--no-edit") {
        state.clean = false;
        state.merging = true;
        throw failure;
      }
      if (args[0] === "diff" && args.includes("--diff-filter=U")) return ok();
      if (args[0] === "merge" && args[1] === "--abort") {
        state.clean = true;
        state.merging = false;
        return ok();
      }
      throw new Error(`unexpected Git invocation: ${args.join(" ")}`);
    };

    await expect(createBaseMergePort({ cwd: "/repo", baseBranch: "main", exec })
      .mergeAppendOnly(oid("a"), oid("c")))
      .rejects.toBe(failure);
    expect(state).toEqual({ head: oid("c"), clean: true, merging: false });
  });

  it("commits a determinate ROADMAP-only remedy with the exact guarded parents", async () => {
    const state = { head: oid("c"), clean: true, merging: false, remedied: false };
    const ok = (stdout = ""): ExecResult => ({ stdout, stderr: "" });
    const exec: GitExec = async (_command, args) => {
      if (args[0] === "status") return ok(state.clean ? "" : "merge state");
      if (args[0] === "rev-parse" && args.at(-1) === "HEAD") return ok(state.head);
      if (args[0] === "rev-parse" && args.at(-1) === "MERGE_HEAD") {
        if (!state.merging) {
          throw makeGitProcessError({ command: "git", args, exitCode: 128, stderr: "no merge" });
        }
        return ok(oid("a"));
      }
      if (args[0] === "merge" && args[1] === "--no-ff") {
        state.clean = false;
        state.merging = true;
        throw makeGitProcessError({ command: "git", args, exitCode: 1, stderr: "ROADMAP conflict" });
      }
      if (args[0] === "diff" && args.includes("--diff-filter=U")) {
        return ok(state.remedied ? "" : ".arc/backlog/ROADMAP.md\n");
      }
      if (args[0] === "diff" && args.includes("--quiet")) return ok();
      if (args[0] === "merge" && args[1] === "--abort") {
        state.clean = true;
        state.merging = false;
        return ok();
      }
      if (args[0] === "commit") {
        if (args.join(" ") !== "commit --no-edit --no-verify") {
          throw makeGitProcessError({ command: "git", args, exitCode: 1, stderr: "commit gate failed" });
        }
        state.head = oid("d");
        state.clean = true;
        state.merging = false;
        return ok();
      }
      if (args[0] === "rev-list") return ok(`${state.head} ${oid("c")} ${oid("a")}\n`);
      throw new Error(`unexpected Git invocation: ${args.join(" ")}`);
    };
    const port = createBaseMergePort({
      cwd: "/repo",
      baseBranch: "main",
      exec,
      applyRegenerableConflict: async () => {
        state.remedied = true;
        return { status: "applied", trigger: "unmerged-only-roadmap", indeterminate: false };
      },
    });
    await expect(port.mergeAppendOnly(oid("a"), oid("c"), "regenerate-roadmap"))
      .resolves.toEqual({ status: "merged", headOid: oid("d") });
    expect(state).toEqual({ head: oid("d"), clean: true, merging: false, remedied: true });
  });

  it("aborts and restores an indeterminate regenerable remedy", async () => {
    const state = { head: oid("c"), clean: true, merging: false };
    const ok = (stdout = ""): ExecResult => ({ stdout, stderr: "" });
    const exec: GitExec = async (_command, args) => {
      if (args[0] === "status") return ok(state.clean ? "" : "merge state");
      if (args[0] === "rev-parse" && args.at(-1) === "HEAD") return ok(state.head);
      if (args[0] === "rev-parse" && args.at(-1) === "MERGE_HEAD") {
        if (!state.merging) {
          throw makeGitProcessError({ command: "git", args, exitCode: 128, stderr: "no merge" });
        }
        return ok(oid("a"));
      }
      if (args[0] === "merge" && args[1] === "--no-ff") {
        state.clean = false;
        state.merging = true;
        throw makeGitProcessError({ command: "git", args, exitCode: 1, stderr: "ROADMAP conflict" });
      }
      if (args[0] === "diff" && args.includes("--diff-filter=U")) return ok(".arc/backlog/ROADMAP.md\n");
      if (args[0] === "merge" && args[1] === "--abort") {
        state.clean = true;
        state.merging = false;
        return ok();
      }
      throw new Error(`unexpected Git invocation: ${args.join(" ")}`);
    };
    const port = createBaseMergePort({
      cwd: "/repo",
      baseBranch: "main",
      exec,
      applyRegenerableConflict: async () => ({
        status: "applied", trigger: "unmerged-only-roadmap", indeterminate: true,
      }),
    });
    await expect(port.mergeAppendOnly(oid("a"), oid("c"), "regenerate-roadmap"))
      .resolves.toEqual({ status: "remedy-refused", detail: "The readiness render was indeterminate." });
    expect(state).toEqual({ head: oid("c"), clean: true, merging: false });
  });

  it("refuses moved merge parents before committing a regenerated projection", async () => {
    const state = { head: oid("c"), mergeHead: oid("a"), clean: true, merging: false, remedied: false };
    const ok = (stdout = ""): ExecResult => ({ stdout, stderr: "" });
    const exec: GitExec = async (_command, args) => {
      if (args[0] === "status") return ok(state.clean ? "" : "merge state");
      if (args[0] === "rev-parse" && args.at(-1) === "HEAD") return ok(state.head);
      if (args[0] === "rev-parse" && args.at(-1) === "MERGE_HEAD") {
        if (!state.merging) {
          throw makeGitProcessError({ command: "git", args, exitCode: 128, stderr: "no merge" });
        }
        return ok(state.mergeHead);
      }
      if (args[0] === "merge" && args[1] === "--no-ff") {
        state.clean = false;
        state.merging = true;
        throw makeGitProcessError({ command: "git", args, exitCode: 1, stderr: "ROADMAP conflict" });
      }
      if (args[0] === "diff" && args.includes("--diff-filter=U")) {
        return ok(state.remedied ? "" : ".arc/backlog/ROADMAP.md\n");
      }
      if (args[0] === "merge" && args[1] === "--abort") {
        state.clean = true;
        state.merging = false;
        return ok();
      }
      throw new Error(`unexpected Git invocation: ${args.join(" ")}`);
    };
    const port = createBaseMergePort({
      cwd: "/repo",
      baseBranch: "main",
      exec,
      applyRegenerableConflict: async () => {
        state.remedied = true;
        state.mergeHead = oid("e");
        return { status: "applied", trigger: "unmerged-only-roadmap", indeterminate: false };
      },
    });
    await expect(port.mergeAppendOnly(oid("a"), oid("c"), "regenerate-roadmap"))
      .resolves.toEqual({
        status: "remedy-refused",
        detail: "The merge coordinates moved during readiness regeneration.",
      });
    expect(state).toEqual({
      head: oid("c"), mergeHead: oid("e"), clean: true, merging: false, remedied: true,
    });
  });
});
