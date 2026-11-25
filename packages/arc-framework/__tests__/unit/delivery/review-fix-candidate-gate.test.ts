import { describe, expect, it, vi } from "vitest";

import type { GitExec } from "../../../src/lib/git/exec.js";
import { scriptGitExec } from "../../helpers/git-exec-fake.js";
import {
  observeDeliveryReviewFixCandidateGate,
  prepareDeliveryReviewFixCandidateGate,
} from
  "../../../src/lib/delivery/review-fix-candidate-gate.js";

const beforeHead = "a".repeat(40);
const beforeTree = "b".repeat(40);
const currentHead = "c".repeat(40);
const currentTree = "d".repeat(40);
const gatePath = "/repo/.git/arc/delivery-gates/plan/member";

function gateExec(input: {
  readonly dirty?: boolean;
  readonly attached?: boolean;
} = {}): GitExec {
  const binding = input.attached ? "branch refs/heads/member" : "detached";
  return scriptGitExec([
    { match: ["worktree", "list", "--porcelain", "-z"],
      responses: [{ stdout: `worktree ${gatePath}\0HEAD ${beforeHead}\0${binding}\0\0` }] },
    { match: ["status", "--porcelain=v1", "-z", "--untracked-files=all"],
      responses: [{ stdout: input.dirty ? "?? untracked.txt\0" : "" }] },
    { match: { prefix: ["rev-parse", "--path-format=absolute", "--git-path"] },
      responses: [({ args }) => ({ stdout: `/repo/.git/${args.at(-1) ?? "unknown"}\n` })] },
    { match: ["rev-parse", "--verify", "HEAD^{commit}"],
      responses: [{ stdout: `${beforeHead}\n` }] },
    { match: ["rev-list", "--parents", "-n", "1", beforeHead],
      responses: [{ stdout: `${beforeHead}\n` }] },
    { match: ["rev-parse", `${beforeHead}^{tree}`], responses: [{ stdout: `${beforeTree}\n` }] },
  ]).exec;
}

describe("prepareDeliveryReviewFixCandidateGate", () => {
  it("rematerializes one exact clean stale candidate pair to the current public head", async () => {
    let gate = { status: "observed" as const, head: beforeHead, tree: beforeTree };
    let candidate = { status: "observed" as const, head: beforeHead, tree: beforeTree };

    await expect(prepareDeliveryReviewFixCandidateGate({
      before: { head: beforeHead, tree: beforeTree },
      current: { head: currentHead, tree: currentTree },
    }, {
      observeGate: () => Promise.resolve(gate),
      observeCandidate: () => Promise.resolve(candidate),
      rewriteCandidate: (input) => {
        if (candidate.head !== input.beforeHead) {
          return Promise.resolve({ status: "refused" as const, reason: "collision" });
        }
        candidate = { status: "observed", head: input.requestedHead, tree: currentTree };
        return Promise.resolve({ status: "rewritten" as const });
      },
      resetGate: (input) => {
        gate = { status: "observed", head: input.requestedHead, tree: currentTree };
        return Promise.resolve({ status: "reset" as const });
      },
      createPair: vi.fn(),
    })).resolves.toEqual({ status: "rematerialized" });

    expect(gate).toEqual({ status: "observed", head: currentHead, tree: currentTree });
    expect(candidate).toEqual({ status: "observed", head: currentHead, tree: currentTree });
  });

  it("restores the candidate lease when the detached gate cannot move", async () => {
    let candidateHead = beforeHead;

    await expect(prepareDeliveryReviewFixCandidateGate({
      before: { head: beforeHead, tree: beforeTree },
      current: { head: currentHead, tree: currentTree },
    }, {
      observeGate: vi.fn().mockResolvedValue({ status: "observed", head: beforeHead, tree: beforeTree }),
      observeCandidate: () => Promise.resolve({
        status: "observed" as const,
        head: candidateHead,
        tree: candidateHead === beforeHead ? beforeTree : currentTree,
      }),
      rewriteCandidate: (input) => {
        if (candidateHead !== input.beforeHead) {
          return Promise.resolve({ status: "refused" as const, reason: "collision" });
        }
        candidateHead = input.requestedHead;
        return Promise.resolve({ status: "rewritten" as const });
      },
      resetGate: vi.fn().mockResolvedValue({ status: "refused", reason: "reset-failed" }),
      createPair: vi.fn(),
    })).resolves.toEqual({ status: "refused", reason: "candidate-gate-reset-failed" });

    expect(candidateHead).toBe(beforeHead);
  });

  it("creates an absent pair and adopts an exact current replay", async () => {
    let gate: { status: "absent" } | { status: "observed"; head: string; tree: string } = {
      status: "absent",
    };
    let candidate: { status: "absent" } | { status: "observed"; head: string; tree: string } = {
      status: "absent",
    };
    const unused = vi.fn();

    await expect(prepareDeliveryReviewFixCandidateGate({
      before: { head: beforeHead, tree: beforeTree },
      current: { head: currentHead, tree: currentTree },
    }, {
      observeGate: () => Promise.resolve(gate),
      observeCandidate: () => Promise.resolve(candidate),
      rewriteCandidate: unused,
      resetGate: unused,
      createPair: (coordinates) => {
        gate = { status: "observed", ...coordinates };
        candidate = { status: "observed", ...coordinates };
        return Promise.resolve({ status: "created" as const });
      },
    })).resolves.toEqual({ status: "rematerialized" });
    expect(gate).toEqual({ status: "observed", head: currentHead, tree: currentTree });
    expect(candidate).toEqual({ status: "observed", head: currentHead, tree: currentTree });

    await expect(prepareDeliveryReviewFixCandidateGate({
      before: { head: beforeHead, tree: beforeTree },
      current: { head: currentHead, tree: currentTree },
    }, {
      observeGate: vi.fn().mockResolvedValue({ status: "observed", head: currentHead, tree: currentTree }),
      observeCandidate: vi.fn().mockResolvedValue({ status: "observed", head: currentHead, tree: currentTree }),
      rewriteCandidate: unused,
      resetGate: unused,
      createPair: unused,
    })).resolves.toEqual({ status: "already-rematerialized", replayed: true });
  });

  it.each([
    [
      "a split pair",
      { status: "observed", head: beforeHead, tree: beforeTree },
      { status: "absent" },
      "candidate-pair-split",
    ],
    [
      "an authored-ahead pair",
      { status: "observed", head: "e".repeat(40), tree: "f".repeat(40) },
      { status: "observed", head: beforeHead, tree: beforeTree },
      "candidate-pair-moved",
    ],
    [
      "a dirty gate",
      { status: "refused", reason: "dirty" },
      { status: "observed", head: beforeHead, tree: beforeTree },
      "candidate-gate-dirty",
    ],
  ])("refuses %s without an effect", async (_label, gate, candidate, reason) => {
    const effect = vi.fn();
    await expect(prepareDeliveryReviewFixCandidateGate({
      before: { head: beforeHead, tree: beforeTree },
      current: { head: currentHead, tree: currentTree },
    }, {
      observeGate: vi.fn().mockResolvedValue(gate),
      observeCandidate: vi.fn().mockResolvedValue(candidate),
      rewriteCandidate: effect,
      resetGate: effect,
      createPair: effect,
    })).resolves.toEqual({ status: "refused", reason });
    expect(effect).not.toHaveBeenCalled();
  });
});

describe("observeDeliveryReviewFixCandidateGate", () => {
  it("observes only one clean detached operation-free exact gate", async () => {
    await expect(observeDeliveryReviewFixCandidateGate({
      exec: gateExec(),
      path: gatePath,
      pathExists: (path) => Promise.resolve(path === gatePath),
    })).resolves.toEqual({ status: "observed", head: beforeHead, tree: beforeTree });
  });

  it.each([
    ["dirty", gateExec({ dirty: true }), (path: string) => path === gatePath, "dirty"],
    ["attached", gateExec({ attached: true }), (path: string) => path === gatePath, "attached"],
    ["operation", gateExec(), (path: string) => path === gatePath || path.endsWith("/MERGE_HEAD"),
      "operation-in-progress"],
    ["foreign", (async () => ({ stdout: "" })) as GitExec, () => true, "path-collision"],
  ])("refuses a %s gate without treating it as absent", async (_label, exec, exists, reason) => {
    await expect(observeDeliveryReviewFixCandidateGate({
      exec,
      path: gatePath,
      pathExists: (path) => Promise.resolve(exists(path)),
    })).resolves.toEqual({ status: "refused", reason });
  });
});
