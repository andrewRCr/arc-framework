import { describe, expect, it } from "vitest";

import {
  settleHostedFinding,
  type HostedSettlementPort,
} from "../../../../../src/scripts/review-gate/hosted/settle.js";

const HEAD = "a".repeat(40);
const request = {
  schemaVersion: 1 as const,
  target: { repository: "owner/repo", pullRequest: 42, headSha: HEAD },
  actorIdentity: "1234",
  finding: { commentId: "PRRC_1", threadId: "PRRT_1" },
  disposition: "defer" as const,
  reply: "Deferred to the follow-up tracked in issue #99.",
};

function port(overrides: Partial<HostedSettlementPort> = {}): HostedSettlementPort {
  let resolved = false;
  let replies: Array<{ id: string; actorIdentity: string; body: string; inReplyToId: string }> = [];
  return {
    currentActorIdentity: () => Promise.resolve("1234"),
    readHead: () => Promise.resolve(HEAD),
    readThread: () => Promise.resolve({
      kind: "present",
      isResolved: resolved,
      commentIds: ["PRRC_1"],
    }),
    findReplies: () => Promise.resolve(replies),
    postReply: (input) => {
      replies = [{
        id: "PRRC_REPLY",
        actorIdentity: "1234",
        body: input.body,
        inReplyToId: input.commentId,
      }];
      return Promise.resolve({ kind: "created", id: "PRRC_REPLY" });
    },
    resolveThread: () => {
      resolved = true;
      return Promise.resolve({ kind: "resolved" });
    },
    ...overrides,
  };
}

describe("hosted finding settlement", () => {
  it.each(["defer", "reject"] as const)("replies directly and resolves a %s disposition", async (disposition) => {
    const result = await settleHostedFinding({ ...request, disposition }, { port: port() });

    expect(result).toMatchObject({
      state: "settled",
      nextAction: "complete",
      disposition,
      replyId: "PRRC_REPLY",
      threadId: "PRRT_1",
    });
  });

  it("reports an already-settled thread idempotently", async () => {
    const result = await settleHostedFinding(request, {
      port: port({
        readThread: () => Promise.resolve({
          kind: "present",
          isResolved: true,
          commentIds: ["PRRC_1"],
        }),
      }),
    });

    expect(result).toMatchObject({ state: "already-settled", nextAction: "complete" });
  });

  it("stops without posting when multiple canonical replies already exist", async () => {
    let posts = 0;
    const result = await settleHostedFinding(request, {
      port: port({
        findReplies: () => Promise.resolve(["FIRST", "SECOND"].map((id) => ({
          id,
          actorIdentity: request.actorIdentity,
          body: request.reply,
          inReplyToId: request.finding.commentId,
        }))),
        postReply: () => {
          posts += 1;
          return Promise.resolve({ kind: "created", id: "THIRD" });
        },
      }),
    });

    expect(result).toMatchObject({ state: "ambiguous", nextAction: "stop" });
    expect(posts).toBe(0);
  });

  it.each([
    ["missing-thread", { kind: "missing" as const }],
    ["missing-comment", {
      kind: "present" as const,
      isResolved: false,
      commentIds: ["PRRC_OTHER"],
    }],
  ])("returns explicit %s state", async (state, thread) => {
    const result = await settleHostedFinding(request, {
      port: port({ readThread: () => Promise.resolve(thread) }),
    });

    expect(result).toMatchObject({ state, nextAction: "stop" });
  });

  it("stops on actor or exact-head mismatch before mutation", async () => {
    const actor = await settleHostedFinding(request, {
      port: port({ currentActorIdentity: () => Promise.resolve("9999") }),
    });
    const head = await settleHostedFinding(request, {
      port: port({ readHead: () => Promise.resolve("b".repeat(40)) }),
    });

    expect(actor).toMatchObject({ state: "actor-mismatch", nextAction: "stop" });
    expect(head).toMatchObject({ state: "stale-target", nextAction: "stop" });
  });

  it.each([
    ["reply", [HEAD, "b".repeat(40)], 0, 0],
    ["resolution", [HEAD, HEAD, "b".repeat(40)], 1, 0],
  ] as const)(
    "stops when the head changes immediately before %s mutation",
    async (_boundary, heads, expectedReplies, expectedResolutions) => {
      let replies = 0;
      let resolutions = 0;
      const remainingHeads = [...heads];
      const result = await settleHostedFinding(request, {
        port: port({
          readHead: () => Promise.resolve(remainingHeads.shift() ?? HEAD),
          postReply: () => {
            replies += 1;
            return Promise.resolve({ kind: "created", id: "PRRC_REPLY" });
          },
          findReplies: () => Promise.resolve(replies === 0 ? [] : [{
            id: "PRRC_REPLY",
            actorIdentity: request.actorIdentity,
            body: request.reply,
            inReplyToId: request.finding.commentId,
          }]),
          resolveThread: () => {
            resolutions += 1;
            return Promise.resolve({ kind: "resolved" });
          },
        }),
      });

      expect(result).toMatchObject({ state: "stale-target", nextAction: "stop" });
      expect(replies).toBe(expectedReplies);
      expect(resolutions).toBe(expectedResolutions);
    },
  );
});
