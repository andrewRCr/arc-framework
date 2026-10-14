import { afterEach, describe, expect, it } from "vitest";

import { handleReviewHostedSettle } from "../../src/handlers/review.js";
import { createHostedSettlementHeadRegistration } from "../../src/scripts/review-gate/hosted/settlement-head.js";
import { HostedSettleResultSchema, settleHostedFinding, type HostedSettlementPort } from "../../src/scripts/review-gate/hosted/settle.js";
import { makeGitExec } from "../helpers/integration.js";
import { createTempRepoCore, removeGitBackedDir } from "../helpers/temp-repo.js";

const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map(root => removeGitBackedDir(root))); });

describe("hosted fix settlement with repository ancestry", () => {
  it.each(["ancestor", "diverged", "missing"])("routes a host's %s head through the public handler", async scenario => {
    const root = await createTempRepoCore({ prefix: "arc-settle-registration-" });
    roots.push(root);
    const exec = makeGitExec(root);
    await exec("git", ["commit", "--allow-empty", "-m", "origin"]);
    const { stdout: original } = await exec("git", ["rev-parse", "HEAD"]);
    await exec("git", ["switch", "-c", "fix"]);
    await exec("git", ["commit", "--allow-empty", "-m", "fix"]);
    const { stdout: fixed } = await exec("git", ["rev-parse", "HEAD"]);
    await exec("git", ["switch", "main"]);
    await exec("git", ["commit", "--allow-empty", "-m", "another change"]);
    const { stdout: diverged } = await exec("git", ["rev-parse", "HEAD"]);
    const target = { repository: "owner/repo", pullRequest: 42, headSha: original.trim() };
    const request = {
      schemaVersion: 1, response: { attemptRef: "arc-review-source:v1:hosted:lane-progress%2F1:hosted%2F1",
        dispositionSetId: `sha256:${"d".repeat(64)}`, findingId: "finding-1" },
      target, fixTarget: { ...target, headSha: fixed.trim() }, actorIdentity: "1234",
      finding: { commentId: "1", threadId: "thread-1" }, disposition: "fix", reply: "Changed the fix behavior.",
    };
    let hostHead = scenario === "ancestor" ? original.trim() : scenario === "missing" ? "f".repeat(40) : diverged.trim();
    let resolved = false;
    let replied = false;
    const port: HostedSettlementPort = {
      currentActorIdentity: async () => "1234",
      readHead: async () => hostHead,
      readThread: async () => ({ kind: "present", isResolved: resolved, commentIds: ["1"] }),
      findReplies: async () => replied ? [{ id: "reply-1", actorIdentity: "1234", body: request.reply, inReplyToId: "1" }] : [],
      postReply: async () => { replied = true; return { kind: "created", id: "reply-1" }; },
      resolveThread: async () => { resolved = true; return { kind: "resolved" }; },
    };
    let elapsed = 0;
    const headRegistration = createHostedSettlementHeadRegistration(exec, root);
    headRegistration.clock = { now: () => elapsed, sleep: async milliseconds => { elapsed += milliseconds; } };
    async function invoke(input: unknown) {
      const output: string[] = [];
      let exitCode = 0;
      await handleReviewHostedSettle("-", {
        readText: async () => JSON.stringify(input),
        settle: parsed => settleHostedFinding(parsed, { port, headRegistration }),
        write: text => { output.push(text); }, setExitCode: code => { exitCode = code; },
      });
      expect(exitCode, output.join("")).toBe(0);
      expect(output).toHaveLength(1);
      return HostedSettleResultSchema.parse(JSON.parse(output[0]!));
    }
    const before = await exec("git", ["rev-parse", "HEAD"]);
    const stopped = await invoke(request);
    expect(stopped).toMatchObject(scenario === "ancestor"
      ? { state: "head-pending", nextAction: "retry", observedHeadSha: original.trim(), expectedHeadSha: fixed.trim() }
      : { state: "stale-target", nextAction: "stop" });
    expect({ resolved, replied }).toEqual({ resolved: false, replied: false });
    expect(elapsed).toBe(scenario === "ancestor" ? 10_000 : 0);
    if (stopped.state === "head-pending") {
      hostHead = fixed.trim();
      expect(await invoke(stopped.remedy.stdin)).toMatchObject({ state: "settled", nextAction: "complete" });
      expect({ resolved, replied }).toEqual({ resolved: true, replied: true });
    }
    if (scenario === "missing") {
      hostHead = fixed.trim();
      expect(await invoke(request)).toMatchObject({ state: "settled", nextAction: "complete" });
      expect({ resolved, replied }).toEqual({ resolved: true, replied: true });
    }
    expect(await exec("git", ["rev-parse", "HEAD"])).toEqual(before);
  });
});
