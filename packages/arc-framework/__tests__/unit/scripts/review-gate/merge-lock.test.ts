import { describe, expect, it } from "vitest";

import {
  MergeLockResolveRequestSchema,
  MergeLockTransitionRequestSchema,
  holdMergeLock,
  releaseMergeLock,
  resolveMergeLock,
  type MergeLockPort,
  type MergeLockSetting,
  type MergeLockTransition,
} from "../../../../src/scripts/review-gate/merge-lock.js";
import type { ReviewReadinessRequest } from "../../../../src/scripts/review-gate/readiness.js";

const SHA = "a".repeat(40);

const TARGET = {
  repository: "owner/repo",
  pullRequest: 42,
  headSha: SHA,
};

const VEHICLE = {
  kind: "work-unit" as const,
  slug: "demo",
  archiveCadence: "manual" as const,
};

describe("MergeLockResolveRequestSchema", () => {
  it("accepts a tree root alone", () => {
    const parsed = MergeLockResolveRequestSchema.parse({
      schemaVersion: 1,
      treeRoot: "/candidate",
    });

    expect(parsed).toEqual({ schemaVersion: 1, treeRoot: "/candidate" });
  });

  it("rejects a request carrying a target", () => {
    expect(() => MergeLockResolveRequestSchema.parse({
      schemaVersion: 1,
      treeRoot: "/candidate",
      target: TARGET,
    })).toThrow();
  });

  it("rejects a request carrying a vehicle", () => {
    expect(() => MergeLockResolveRequestSchema.parse({
      schemaVersion: 1,
      treeRoot: "/candidate",
      vehicle: VEHICLE,
    })).toThrow();
  });
});

describe("MergeLockTransitionRequestSchema", () => {
  it("accepts a guarded target with its vehicle", () => {
    const parsed = MergeLockTransitionRequestSchema.parse({
      schemaVersion: 1,
      treeRoot: "/candidate",
      target: TARGET,
      vehicle: VEHICLE,
    });

    expect(parsed).toEqual({
      schemaVersion: 1,
      treeRoot: "/candidate",
      target: TARGET,
      vehicle: VEHICLE,
    });
  });

  it("rejects a request missing its target", () => {
    expect(() => MergeLockTransitionRequestSchema.parse({
      schemaVersion: 1,
      treeRoot: "/candidate",
      vehicle: VEHICLE,
    })).toThrow();
  });

  it("rejects a request missing its vehicle", () => {
    expect(() => MergeLockTransitionRequestSchema.parse({
      schemaVersion: 1,
      treeRoot: "/candidate",
      target: TARGET,
    })).toThrow();
  });
});

function resolveRequest() {
  return { schemaVersion: 1 as const, treeRoot: "/candidate" };
}

function configPort(setting: MergeLockSetting | (() => Promise<never>)) {
  const roots: string[] = [];
  return {
    roots,
    readMergeLock: async (treeRoot: string) => {
      roots.push(treeRoot);
      if (typeof setting === "function") return setting();
      return setting;
    },
  };
}

describe("resolveMergeLock", () => {
  it("opens locked under the draft lock", async () => {
    const port = configPort({ state: "value", value: "draft" });

    const result = await resolveMergeLock(resolveRequest(), port);

    expect(result).toEqual({
      schemaVersion: 1,
      mode: "merge-lock-resolve",
      diagnostics: [],
      state: "locked",
      nextAction: "open-locked",
      payload: {},
    });
    expect(port.roots).toEqual(["/candidate"]);
  });

  it("opens plain when the lock is off", async () => {
    const result = await resolveMergeLock(resolveRequest(), configPort({ state: "value", value: "none" }));

    expect(result).toMatchObject({ state: "none", nextAction: "open-plain", payload: {} });
  });

  it("opens plain on an absent key — the documented default, not an error", async () => {
    const result = await resolveMergeLock(resolveRequest(), configPort({ state: "absent" }));

    expect(result).toMatchObject({ state: "none", nextAction: "open-plain", diagnostics: [] });
  });

  it("blocks on an unreadable config rather than defaulting either way", async () => {
    const result = await resolveMergeLock(resolveRequest(), configPort({ state: "unreadable" }));

    expect(result).toMatchObject({
      state: "blocked",
      nextAction: "stop",
      payload: { reason: "config-unresolved" },
    });
    expect(result.diagnostics).toHaveLength(1);
  });

  it("blocks on an out-of-domain value", async () => {
    const result = await resolveMergeLock(resolveRequest(), configPort({ state: "value", value: "Draft" }));

    expect(result).toMatchObject({
      state: "blocked",
      nextAction: "stop",
      payload: { reason: "config-unresolved" },
    });
  });

  it("blocks when the config read throws", async () => {
    const result = await resolveMergeLock(
      resolveRequest(),
      configPort(() => Promise.reject(new Error("read failed"))),
    );

    expect(result).toMatchObject({ state: "blocked", payload: { reason: "config-unresolved" } });
  });
});

function transitionRequest() {
  return {
    schemaVersion: 1 as const,
    treeRoot: "/candidate",
    target: TARGET,
    vehicle: VEHICLE,
  };
}

function readyEnvelope() {
  return {
    schemaVersion: 1 as const,
    mode: "review-readiness" as const,
    diagnostics: [],
    state: "ready" as const,
    nextAction: "none" as const,
    payload: { target: TARGET, vehicle: VEHICLE },
  };
}

function invalidEnvelope() {
  const fact = {
    code: "missing-artifact",
    path: ".arc/active/meta-demo.md",
    message: "missing",
  };
  return {
    schemaVersion: 1 as const,
    mode: "review-readiness" as const,
    diagnostics: [fact],
    state: "invalid" as const,
    nextAction: "stop" as const,
    payload: { target: TARGET, vehicle: VEHICLE, facts: [fact] },
  };
}

interface FakeLockPort extends MergeLockPort {
  transitions: MergeLockTransition[];
  readinessRequests: ReviewReadinessRequest[];
  repositoryReads: number;
}

function lockPort(overrides: Partial<MergeLockPort> = {}, locked = true): FakeLockPort {
  const transitions: MergeLockTransition[] = [];
  const readinessRequests: ReviewReadinessRequest[] = [];
  const port: FakeLockPort = {
    transitions,
    readinessRequests,
    repositoryReads: 0,
    readMergeLock: async () => ({ state: "value", value: "draft" }),
    resolveRepository: async () => {
      port.repositoryReads += 1;
      return { repository: "owner/repo", defaultBranch: "main" };
    },
    resolvePullRequest: async () => ({
      repository: "owner/repo",
      number: 42,
      state: "open" as const,
      headBranch: "feat/demo",
      headSha: SHA,
      locked,
    }),
    checkReadiness: async (request) => {
      readinessRequests.push(request);
      return readyEnvelope();
    },
    applyTransition: async (transition) => {
      transitions.push(transition);
    },
    ...overrides,
  };
  return port;
}

describe("releaseMergeLock", () => {
  it("releases a locked pull request at the exact head", async () => {
    const port = lockPort();

    const result = await releaseMergeLock(transitionRequest(), port);

    expect(result).toMatchObject({
      mode: "merge-lock-release",
      state: "released",
      nextAction: "proceed",
      payload: TARGET,
    });
    expect(port.transitions).toEqual([{
      repository: "owner/repo",
      pullRequest: 42,
      transition: "release",
    }]);
  });

  it("narrows the port payload before composing the readiness request", async () => {
    const port = lockPort();

    await releaseMergeLock(transitionRequest(), port);

    expect(port.readinessRequests).toEqual([{
      schemaVersion: 1,
      treeRoot: "/candidate",
      target: TARGET,
      pullRequest: {
        repository: "owner/repo",
        number: 42,
        state: "open",
        headBranch: "feat/demo",
        headSha: SHA,
      },
      vehicle: VEHICLE,
    }]);
  });

  it("reports no lock on a pull request that is already unlocked", async () => {
    const port = lockPort({}, false);

    const result = await releaseMergeLock(transitionRequest(), port);

    expect(result).toMatchObject({
      state: "no-lock",
      nextAction: "none",
      payload: { ...TARGET, reason: "already-in-state" },
    });
    expect(port.transitions).toEqual([]);
  });

  it("gates a pull request someone else already readied, rather than waving it through", async () => {
    const port = lockPort({ checkReadiness: async () => invalidEnvelope() }, false);

    const result = await releaseMergeLock(transitionRequest(), port);

    expect(result).toMatchObject({
      state: "blocked",
      nextAction: "stop",
      payload: { reason: "readiness-failed" },
    });
  });

  it("runs the readiness gate even when no host transition is needed", async () => {
    const port = lockPort({}, false);

    await releaseMergeLock(transitionRequest(), port);

    expect(port.readinessRequests).toHaveLength(1);
    expect(port.transitions).toEqual([]);
  });

  it("blocks a lifecycle-unready candidate and carries its diagnostics", async () => {
    const port = lockPort({ checkReadiness: async () => invalidEnvelope() });

    const result = await releaseMergeLock(transitionRequest(), port);

    expect(result).toMatchObject({
      state: "blocked",
      nextAction: "stop",
      payload: { ...TARGET, reason: "readiness-failed" },
      diagnostics: expect.arrayContaining([{
        code: "missing-artifact",
        message: ".arc/active/meta-demo.md: missing",
      }]),
    });
    expect(port.transitions).toEqual([]);
  });

  it("blocks a readiness result bound to a different exact target", async () => {
    const port = lockPort({
      checkReadiness: async () => ({
        ...readyEnvelope(),
        payload: { ...readyEnvelope().payload, target: { ...TARGET, headSha: "b".repeat(40) } },
      }),
    });

    const result = await releaseMergeLock(transitionRequest(), port);

    expect(result).toMatchObject({
      state: "blocked",
      payload: { reason: "readiness-failed" },
      diagnostics: expect.arrayContaining([
        expect.objectContaining({ code: "readiness-target-mismatch" }),
      ]),
    });
    expect(port.transitions).toEqual([]);
  });
});

const MEMBER_VEHICLE = {
  kind: "delivery-member" as const,
  planId: "3f2b1c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d",
  deliverableId: `sha256:${"b".repeat(64)}`,
  workUnitSlug: "demo",
};

function memberTransitionRequest() {
  return { ...transitionRequest(), vehicle: MEMBER_VEHICLE };
}

function readyMemberEnvelope() {
  return { ...readyEnvelope(), payload: { target: TARGET, vehicle: MEMBER_VEHICLE } };
}

function unboundMemberEnvelope() {
  const fact = {
    code: "delivery-member-unbound",
    path: "pullRequest.headSha",
    message: "The pull request's exact live head is bound to no delivery member.",
  };
  return {
    ...invalidEnvelope(),
    diagnostics: [fact],
    payload: { target: TARGET, vehicle: MEMBER_VEHICLE, facts: [fact] },
  };
}

describe("merge-lock transitions over a delivery-member vehicle", () => {
  it("accepts the member vehicle on the transition request and forwards it unchanged", async () => {
    const port = lockPort({ checkReadiness: async (request) => {
      port.readinessRequests.push(request);
      return readyMemberEnvelope();
    } });

    await releaseMergeLock(MergeLockTransitionRequestSchema.parse(memberTransitionRequest()), port);

    expect(port.readinessRequests[0]?.vehicle).toEqual(MEMBER_VEHICLE);
  });

  it("releases a lock for a ready member", async () => {
    const port = lockPort({ checkReadiness: async () => readyMemberEnvelope() });

    const result = await releaseMergeLock(memberTransitionRequest(), port);

    expect(result).toMatchObject({
      mode: "merge-lock-release",
      state: "released",
      nextAction: "proceed",
      payload: TARGET,
    });
    expect(port.transitions).toEqual([{
      repository: "owner/repo",
      pullRequest: 42,
      transition: "release",
    }]);
  });

  it("blocks a member whose readiness refuses and carries its diagnostics", async () => {
    const port = lockPort({ checkReadiness: async () => unboundMemberEnvelope() });

    const result = await releaseMergeLock(memberTransitionRequest(), port);

    expect(result).toMatchObject({
      state: "blocked",
      nextAction: "stop",
      payload: { ...TARGET, reason: "readiness-failed" },
      diagnostics: expect.arrayContaining([{
        code: "delivery-member-unbound",
        message: "pullRequest.headSha: The pull request's exact live head is bound to no delivery member.",
      }]),
    });
    expect(port.transitions).toEqual([]);
  });

  it("blocks a member whose readiness result binds a different exact target", async () => {
    const port = lockPort({
      checkReadiness: async () => ({
        ...readyMemberEnvelope(),
        payload: { vehicle: MEMBER_VEHICLE, target: { ...TARGET, headSha: "b".repeat(40) } },
      }),
    });

    const result = await releaseMergeLock(memberTransitionRequest(), port);

    expect(result).toMatchObject({
      state: "blocked",
      payload: { reason: "readiness-failed" },
      diagnostics: expect.arrayContaining([
        expect.objectContaining({ code: "readiness-target-mismatch" }),
      ]),
    });
    expect(port.transitions).toEqual([]);
  });

  it("locks a member without consulting readiness at all", async () => {
    const port = lockPort({ checkReadiness: async () => unboundMemberEnvelope() }, false);

    const result = await holdMergeLock(memberTransitionRequest(), port);

    expect(result).toMatchObject({ mode: "merge-lock-hold", state: "held", nextAction: "proceed" });
    expect(port.readinessRequests).toEqual([]);
    expect(port.transitions).toEqual([{
      repository: "owner/repo",
      pullRequest: 42,
      transition: "hold",
    }]);
  });
});

describe("holdMergeLock", () => {
  it("holds an unlocked pull request", async () => {
    const port = lockPort({}, false);

    const result = await holdMergeLock(transitionRequest(), port);

    expect(result).toMatchObject({
      mode: "merge-lock-hold",
      state: "held",
      nextAction: "proceed",
      payload: TARGET,
    });
    expect(port.transitions).toEqual([{
      repository: "owner/repo",
      pullRequest: 42,
      transition: "hold",
    }]);
  });

  it("reports no lock on a pull request that is already locked", async () => {
    const port = lockPort();

    const result = await holdMergeLock(transitionRequest(), port);

    expect(result).toMatchObject({
      state: "no-lock",
      payload: { ...TARGET, reason: "already-in-state" },
    });
    expect(port.transitions).toEqual([]);
  });

  it("runs no readiness gate — an unready candidate still locks", async () => {
    const port = lockPort({ checkReadiness: async () => invalidEnvelope() }, false);

    const result = await holdMergeLock(transitionRequest(), port);

    expect(result).toMatchObject({ state: "held", nextAction: "proceed" });
    expect(port.readinessRequests).toEqual([]);
    expect(port.transitions).toHaveLength(1);
  });
});

describe("merge-lock transitions", () => {
  it.each([
    ["release", releaseMergeLock, true, 1, 1],
    ["hold", holdMergeLock, false, 0, 0],
  ] as const)("%s reports no lock without reaching the host when the lock is off", async (
    _verb,
    verb,
    locked,
    repositoryReads,
    readinessReads,
  ) => {
    const port = lockPort({ readMergeLock: async () => ({ state: "value", value: "none" }) }, locked);

    const result = await verb(transitionRequest(), port);

    expect(result).toMatchObject({
      state: "no-lock",
      nextAction: "none",
      payload: { ...TARGET, reason: "lock-disabled" },
    });
    expect(port.repositoryReads).toBe(repositoryReads);
    expect(port.readinessRequests).toHaveLength(readinessReads);
    expect(port.transitions).toEqual([]);
  });

  it.each([
    ["release", releaseMergeLock, true],
    ["hold", holdMergeLock, false],
  ] as const)("%s blocks a stale head without mutating the pull request", async (_verb, verb, locked) => {
    const port = lockPort({
      resolvePullRequest: async () => ({
        repository: "owner/repo",
        number: 42,
        state: "open" as const,
        headBranch: "feat/demo",
        headSha: "b".repeat(40),
        locked,
      }),
    }, locked);

    const result = await verb(transitionRequest(), port);

    expect(result).toMatchObject({
      state: "blocked",
      nextAction: "stop",
      payload: { ...TARGET, reason: "stale-head" },
    });
    expect(port.transitions).toEqual([]);
  });

  it.each([
    [
      "unresolvable repository",
      { resolveRepository: async () => { throw new Error("gh failed"); } },
      "repository-unavailable",
    ],
    [
      "repository mismatch",
      { resolveRepository: async () => ({ repository: "owner/other", defaultBranch: "main" }) },
      "repository-mismatch",
    ],
    [
      "unresolvable pull request",
      { resolvePullRequest: async () => { throw new Error("gh failed"); } },
      "pull-request-unavailable",
    ],
    [
      "pull-request number mismatch",
      { resolvePullRequest: async () => ({
        repository: "owner/repo",
        number: 43,
        state: "open" as const,
        headBranch: "feat/demo",
        headSha: SHA,
        locked: true,
      }) },
      "pull-request-mismatch",
    ],
    [
      "closed pull request",
      { resolvePullRequest: async () => ({
        repository: "owner/repo",
        number: 42,
        state: "closed" as const,
        headBranch: "feat/demo",
        headSha: SHA,
        locked: true,
      }) },
      "pull-request-closed",
    ],
    [
      "unreadable config",
      { readMergeLock: async () => ({ state: "unreadable" as const }) },
      "config-unresolved",
    ],
    [
      "failed transition",
      { applyTransition: async () => { throw new Error("gh failed"); } },
      "transition-failed",
    ],
    [
      "malformed readiness result",
      { checkReadiness: async () => ({ state: "surprising" }) as never },
      "readiness-failed",
    ],
  ] as const)("release blocks on %s", async (_case, overrides, reason) => {
    const port = lockPort(overrides);

    const result = await releaseMergeLock(transitionRequest(), port);

    expect(result).toMatchObject({ state: "blocked", nextAction: "stop", payload: { reason } });
  });
});

describe("a push landing during the transition", () => {
  const MOVED = "b".repeat(40);

  /**
   * The preflight sees the target head; the post-transition re-read sees a
   * newer one, which is the race the host's guardless flip permits.
   */
  function advancingPort(overrides: Partial<MergeLockPort> = {}, locked = true): FakeLockPort {
    let reads = 0;
    return lockPort({
      resolvePullRequest: async () => {
        reads += 1;
        return {
          repository: "owner/repo",
          number: 42,
          state: "open" as const,
          headBranch: "feat/demo",
          headSha: reads === 1 ? SHA : MOVED,
          locked,
        };
      },
      ...overrides,
    }, locked);
  }

  it("refuses to report a release that landed on a head nothing evaluated", async () => {
    const port = advancingPort();

    const result = await releaseMergeLock(transitionRequest(), port);

    expect(result).toMatchObject({
      state: "blocked",
      nextAction: "stop",
      payload: { reason: "stale-head" },
    });
  });

  it("puts the lock back when the release landed on the newer head", async () => {
    const port = advancingPort();

    await releaseMergeLock(transitionRequest(), port);

    expect(port.transitions).toEqual([
      { repository: "owner/repo", pullRequest: 42, transition: "release" },
      { repository: "owner/repo", pullRequest: 42, transition: "hold" },
    ]);
  });

  it("names the unreverted release when the compensating hold also fails", async () => {
    let applied = 0;
    const port = advancingPort({
      applyTransition: async () => {
        applied += 1;
        if (applied > 1) throw new Error("gh failed");
      },
    });

    const result = await releaseMergeLock(transitionRequest(), port);

    expect(result).toMatchObject({
      state: "blocked",
      payload: { reason: "transition-failed" },
    });
    expect(result).toMatchObject({
      diagnostics: expect.arrayContaining([
        expect.objectContaining({ code: "release-not-reverted" }),
      ]) as unknown,
    });
  });

  it("reports the drift on hold without a second transition, since locking a newer head is still locked",
    async () => {
      const port = advancingPort({}, false);

      const result = await holdMergeLock(transitionRequest(), port);

      expect(result).toMatchObject({
        state: "blocked",
        nextAction: "stop",
        payload: { reason: "stale-head" },
      });
      expect(port.transitions).toEqual([
        { repository: "owner/repo", pullRequest: 42, transition: "hold" },
      ]);
    });

  it("blocks when the pull request cannot be re-read after the transition", async () => {
    let reads = 0;
    const port = lockPort({
      resolvePullRequest: async () => {
        reads += 1;
        if (reads > 1) throw new Error("gh failed");
        return {
          repository: "owner/repo",
          number: 42,
          state: "open" as const,
          headBranch: "feat/demo",
          headSha: SHA,
          locked: true,
        };
      },
    });

    const result = await releaseMergeLock(transitionRequest(), port);

    expect(result).toMatchObject({
      state: "blocked",
      payload: { reason: "pull-request-unavailable" },
    });
  });
});
