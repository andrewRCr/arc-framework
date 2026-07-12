import { describe, expect, it, vi } from "vitest";

import {
  GhDeveloperActionPort,
  type ProcessRunner,
} from "../../../../../src/scripts/review-gate/runtime/gh-action-port.js";

function runner(outputs: Array<string | Error>): ProcessRunner & { run: ReturnType<typeof vi.fn> } {
  const run = vi.fn(async () => {
    const output = outputs.shift();
    if (output instanceof Error) throw output;
    return { stdout: output ?? "" };
  });
  return { run };
}

describe("developer-authenticated gh action port", () => {
  it("resolves the immutable current actor and posts the exact comment body", async () => {
    const process = runner([
      JSON.stringify({ id: 7 }),
      JSON.stringify({ id: 41, user: { id: 7 }, body: "@codex review", created_at: "2026-07-12T20:00:00Z" }),
    ]);
    const target = new GhDeveloperActionPort(process);

    await expect(target.currentActorIdentity()).resolves.toBe("7");
    await expect(target.postComment({ repositoryRef: "o/r", pullRequestNumber: 7, body: "@codex review" }))
      .resolves.toMatchObject({ kind: "created", comment: { commentId: "41", actorIdentity: "7" } });
    expect(process.run).toHaveBeenLastCalledWith("gh", expect.arrayContaining(["body=@codex review"]));
  });

  it("classifies an uncertain post as ambiguous and adopts only filtered comments", async () => {
    const process = runner([
      new Error("response lost"),
      JSON.stringify([[
        { id: 41, user: { id: 7 }, body: "@codex review", created_at: "2026-07-12T20:00:00Z" },
        { id: 42, user: { id: 8 }, body: "@codex review", created_at: "2026-07-12T20:00:00Z" },
      ]]),
    ]);
    const target = new GhDeveloperActionPort(process);

    await expect(target.postComment({ repositoryRef: "o/r", pullRequestNumber: 7, body: "@codex review" }))
      .resolves.toEqual({ kind: "ambiguous" });
    await expect(target.findComments({
      repositoryRef: "o/r",
      pullRequestNumber: 7,
      actorIdentity: "7",
      body: "@codex review",
      notBefore: "2026-07-12T19:59:00Z",
    })).resolves.toMatchObject([{ commentId: "41" }]);
  });

  it("dispatches reconciliation from the canonical default branch", async () => {
    const process = runner([JSON.stringify({ default_branch: "main" }), ""]);
    const target = new GhDeveloperActionPort(process);
    await target.dispatchReconcile({ repositoryRef: "o/r", pullRequestNumber: 7, headSha: "a".repeat(40) });
    expect(process.run).toHaveBeenLastCalledWith("gh", [
      "api",
      "repos/o/r/actions/workflows/review-gate.yml/dispatches",
      "--method",
      "POST",
      "--field",
      "ref=main",
      "--field",
      "inputs[pull_request]=7",
      "--field",
      `inputs[head_sha]=${"a".repeat(40)}`,
    ]);
  });

  it("posts an exact inline reply and resolves a thread under the expected actor and head", async () => {
    const head = "a".repeat(40);
    const process = runner([
      JSON.stringify({ id: 7 }),
      JSON.stringify({ head: { sha: head } }),
      JSON.stringify({ id: 81, user: { id: 7 }, body: "Addressed and verified in this head.", created_at: "2026-07-12T21:00:00Z" }),
      JSON.stringify({ id: 7 }),
      JSON.stringify({ head: { sha: head } }),
      JSON.stringify({ data: { resolveReviewThread: { thread: { id: "PRRT_1", isResolved: true } } } }),
    ]);
    const target = new GhDeveloperActionPort(process);
    await expect(target.postInlineReply({
      repositoryRef: "o/r", pullRequestNumber: 7, commentId: "41", expectedActorIdentity: "7",
      expectedHeadSha: head, body: "Addressed and verified in this head.",
    })).resolves.toMatchObject({ kind: "created", reply: { commentId: "81", actorIdentity: "7" } });
    await expect(target.resolveReviewThread({
      repositoryRef: "o/r", pullRequestNumber: 7, threadId: "PRRT_1", expectedActorIdentity: "7",
      expectedHeadSha: head,
    })).resolves.toEqual({ kind: "resolved", threadId: "PRRT_1" });
    expect(process.run).toHaveBeenCalledWith("gh", expect.arrayContaining(["pullRequestReviewThreadId=PRRT_1"]));
  });

  it("returns ambiguous instead of replaying a potentially successful reply or resolution", async () => {
    const head = "a".repeat(40);
    const process = runner([JSON.stringify({ id: 7 }), JSON.stringify({ head: { sha: head } }), new Error("lost")]);
    const target = new GhDeveloperActionPort(process);
    await expect(target.postInlineReply({
      repositoryRef: "o/r", pullRequestNumber: 7, commentId: "41", expectedActorIdentity: "7",
      expectedHeadSha: head, body: "Bounded rationale",
    })).resolves.toEqual({ kind: "ambiguous" });
  });
});
