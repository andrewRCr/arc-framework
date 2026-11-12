/** Handoff envelopes carry physical checkout identity independently of other probes. */

import { describe, expect, it } from "vitest";
import { runSessionHandoffStatus, type SessionHandoffProbes } from "../../../src/commands/status.js";
import type { WorktreeIdentity } from "../../../src/lib/git/worktree-identity.js";

async function unavailable(): Promise<never> {
  throw new Error("unrelated probe unavailable");
}

function probes(worktreeIdentity: () => Promise<WorktreeIdentity>): SessionHandoffProbes {
  return {
    worktree: async () => ({ state: "clean", ahead: 0, behind: 0, branch: "topic", remoteEvidence: "exact" }),
    worktreeIdentity,
    user: unavailable,
    dirty: unavailable,
    releaseRouting: unavailable,
    derivedLocusState: unavailable,
    syncInterlock: unavailable,
    head: unavailable,
    pushability: unavailable,
    restateCandidates: unavailable,
    inboxState: unavailable,
  };
}

describe("handoff worktree identity", () => {
  it.each<WorktreeIdentity>([
    { kind: "primary" },
    { kind: "linked", path: "/checkouts/topic" },
  ])("includes $kind identity in the existing worktree slot", async (identity) => {
    const result = await runSessionHandoffStatus({
      identity: null,
      role: null,
      probes: probes(async () => identity),
    });

    expect(result.worktree).toEqual({
      ok: true,
      value: { state: "clean", ahead: 0, behind: 0, branch: "topic", remoteEvidence: "exact", identity },
    });
    expect(result.branch).toBe("topic");
  });

  it("keeps worktree evidence available when physical identity cannot be probed", async () => {
    const result = await runSessionHandoffStatus({
      identity: null,
      role: null,
      probes: probes(async () => { throw new Error("identity unavailable"); }),
    });

    expect(result.worktree).toEqual({
      ok: true,
      value: {
        state: "clean", ahead: 0, behind: 0, branch: "topic", remoteEvidence: "exact", identity: { kind: "primary" },
      },
    });
  });
});
