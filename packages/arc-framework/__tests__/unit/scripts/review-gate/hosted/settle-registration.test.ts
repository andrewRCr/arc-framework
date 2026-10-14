import { describe, expect, it } from "vitest";

import { HostedSettleResultSchema, settleHostedFinding, type HostedSettlementPort } from "../../../../../src/scripts/review-gate/hosted/settle.js";

import type { HostedSettlementHeadRegistration } from "../../../../../src/scripts/review-gate/hosted/settlement-head.js";

const oldHead = "a".repeat(40);
const fixedHead = "b".repeat(40);
const request = {
  schemaVersion: 1 as const,
  response: { attemptRef: "arc-review-source:v1:hosted:lane-progress%2F1:hosted%2F1",
    dispositionSetId: `sha256:${"d".repeat(64)}`, findingId: "finding-1" },
  target: { repository: "owner/repo", pullRequest: 42, headSha: oldHead },
  fixTarget: { repository: "owner/repo", pullRequest: 42, headSha: fixedHead },
  actorIdentity: "1234", finding: { commentId: "1", threadId: "thread-1" },
  disposition: "fix" as const, reply: "Changed the fix behavior.",
};

function harness(heads: string[], ancestor = true) {
  let now = 0;
  let resolved = false;
  let reply: { id: string; actorIdentity: string; body: string; inReplyToId: string } | undefined;
  const port: HostedSettlementPort = {
    currentActorIdentity: async () => request.actorIdentity,
    readHead: async () => heads.length > 1 ? heads.shift()! : heads[0]!,
    readThread: async () => ({ kind: "present", isResolved: resolved, commentIds: [request.finding.commentId] }),
    findReplies: async () => reply === undefined ? [] : [reply],
    postReply: async input => {
      reply = { id: "reply-1", actorIdentity: request.actorIdentity, body: input.body, inReplyToId: input.commentId };
      return { kind: "created", id: reply.id };
    },
    resolveThread: async () => { resolved = true; return { kind: "resolved" }; },
  };
  const headRegistration: HostedSettlementHeadRegistration = { isAncestor: async () => ancestor,
    clock: { now: () => now, sleep: async (milliseconds: number) => { now += milliseconds; } } };
  return {
    port,
    headRegistration,
    state: () => ({ resolved, reply, elapsedMs: now }),
  };
}

describe("hosted fix head registration", () => {
  it("waits for an ancestor head to register, then replies and resolves", async () => {
    const host = harness([oldHead, fixedHead]);
    const result = await settleHostedFinding(request, host);
    expect(result).toMatchObject({ state: "settled", nextAction: "complete", replyId: "reply-1" });
    expect(host.state()).toMatchObject({ resolved: true, reply: { body: request.reply } });
    expect(host.state().elapsedMs).toBeGreaterThan(0);
  });

  it("returns a bounded retry without mutation and completes the same request after registration", async () => {
    const heads = [oldHead];
    const host = harness(heads);
    const pending = HostedSettleResultSchema.parse(await settleHostedFinding(request, host));
    expect(pending).toMatchObject({ state: "head-pending", nextAction: "retry", observedHeadSha: oldHead,
      expectedHeadSha: fixedHead, remedy: { argv: ["arc", "review", "hosted", "settle", "-"], stdin: request } });
    expect(host.state()).toEqual({ resolved: false, reply: undefined, elapsedMs: 10_000 });
    heads[0] = fixedHead;
    if (pending.state !== "head-pending") throw new Error("expected retryable head registration");
    const result = await settleHostedFinding(pending.remedy.stdin, host);
    expect(result).toMatchObject({ state: "settled", nextAction: "complete" });
    expect(host.state()).toMatchObject({ resolved: true, reply: { body: request.reply } });
  });

  it("stops immediately for a diverged head without mutation", async () => {
    const host = harness(["c".repeat(40)], false);
    expect(await settleHostedFinding(request, host)).toMatchObject({ state: "stale-target", nextAction: "stop" });
    expect(host.state()).toEqual({ resolved: false, reply: undefined, elapsedMs: 0 });
  });

  it("stops when a lagging head diverges during the wait", async () => {
    const host = harness([oldHead, "c".repeat(40)]);
    host.headRegistration.isAncestor = async ancestor => ancestor === oldHead;
    expect(await settleHostedFinding(request, host)).toMatchObject({ state: "stale-target", nextAction: "stop" });
    expect(host.state()).toEqual({ resolved: false, reply: undefined, elapsedMs: 1_000 });
  });

  it.each([
    ["reply", [oldHead, fixedHead, oldHead], false],
    ["resolution", [oldHead, fixedHead, fixedHead, oldHead], true],
  ] as const)("keeps the exact head guard immediately before %s", async (_boundary, heads, replied) => {
    const host = harness([...heads]);
    expect(await settleHostedFinding(request, host)).toMatchObject({ state: "stale-target", nextAction: "stop" });
    expect(host.state().resolved).toBe(false);
    expect(host.state().reply !== undefined).toBe(replied);
  });

  it("does not wait for non-fix dispositions", async () => {
    const host = harness([oldHead]);
    expect(await settleHostedFinding({ ...request, disposition: "reject", fixTarget: null,
      target: request.fixTarget }, host)).toMatchObject({ state: "stale-target", nextAction: "stop" });
    expect(host.state()).toEqual({ resolved: false, reply: undefined, elapsedMs: 0 });
  });

  it("allows exact settled-fix replay to wait without posting another reply", async () => {
    const heads = [fixedHead];
    const host = harness(heads);
    expect(await settleHostedFinding(request, host)).toMatchObject({ state: "settled" });
    const reply = host.state().reply;
    heads.splice(0, heads.length, oldHead, fixedHead);
    expect(await settleHostedFinding(request, host)).toMatchObject({ state: "already-settled", replyId: reply?.id });
    expect(host.state().reply).toBe(reply);
    expect(host.state().elapsedMs).toBeGreaterThan(0);
  });
});
