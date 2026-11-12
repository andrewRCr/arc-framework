import { describe, expect, it } from "vitest";

import { scriptGitExec } from "../../helpers/git-exec-fake.js";
import {
  deriveDeliveryResolutionWorkspacePath,
  deriveDeliveryResidueLocators,
  observeDeliveryGateCheckout,
  reapCompletedDeliveryResidue,
  removeDeliveryGateCheckout,
} from "../../../src/lib/delivery/residue-reaping.js";
import type { DeliveryStateV1 } from "../../../src/lib/delivery/schema.js";
import type { GitExec } from "../../../src/lib/git/exec.js";
import { deliveryThreeMemberStackPlanFixture } from "../../fixtures/delivery-plan.js";
import { deliveryStateFixture } from "../../fixtures/delivery-state.js";

function closeoutFixture() {
  const plan = deliveryThreeMemberStackPlanFixture();
  const initial = deliveryStateFixture(plan);
  const state = {
    ...initial,
    members: initial.members.map((member, index) => ({
      ...member,
      ref: index === initial.members.length - 1
        ? "refs/heads/feature/example"
        : `refs/heads/delivery/${plan.workUnitId}/${plan.members[index]!.chunkKey}`,
    })),
  };
  const derived = deriveDeliveryResidueLocators(plan, "/repo/.git");
  if (derived.status !== "derived") throw new Error("fixture locators must derive");
  return { plan, state, locators: derived.locators };
}

describe("delivery closeout residue", () => {
  it("derives only the reserved candidate namespace and Git-common gate paths", () => {
    const { plan, locators } = closeoutFixture();
    expect(locators).toEqual(plan.members.map((member) => ({
      deliverableId: member.deliverableId,
      candidateRef: `refs/arc/delivery-candidates/${plan.planId}/${member.chunkKey}`,
      gatePath: `/repo/.git/arc/delivery-gates/${plan.planId}/${member.chunkKey}`,
    })));
  });

  it("derives one deterministic resolution workspace inside the Git-common ARC namespace", () => {
    const { plan } = closeoutFixture();
    const member = plan.members[1]!;
    expect(deriveDeliveryResolutionWorkspacePath({
      plan,
      deliverableId: member.deliverableId,
      gitCommonDir: "/repo/.git",
    })).toEqual({
      status: "derived",
      path: `/repo/.git/arc/delivery-resolutions/${plan.planId}/${member.chunkKey}`,
    });
  });

  it("reaps exact two-sided member refs and candidate/gate pairs while retaining state bindings", async () => {
    const { plan, state, locators } = closeoutFixture();
    const localMembers = new Set(state.members.slice(0, -1).map((member) => member.ref!));
    const remoteMembers = new Set(localMembers);
    const candidates = new Map(locators.map((locator, index) => [locator.candidateRef, String(index + 7).repeat(40)]));
    const gates = new Map(locators.map((locator, index) => [locator.gatePath, String(index + 7).repeat(40)]));
    const writes: DeliveryStateV1[] = [];
    const result = await reapCompletedDeliveryResidue({
      plan,
      current: { revision: 4, value: state },
      gitCommonDir: "/repo/.git",
    }, {
      observeRefreshCandidates: async () => ({ status: "observed", candidates: [] }),
      observeCandidate: async (ref) => candidates.has(ref)
        ? { status: "observed", head: candidates.get(ref)! }
        : { status: "absent" },
      observeGate: async (path) => gates.has(path)
        ? { status: "observed", head: gates.get(path)! }
        : { status: "absent" },
      deleteCandidate: async ({ ref, expectedHead }) => {
        if (candidates.get(ref) !== expectedHead) return { status: "refused" };
        candidates.delete(ref);
        return { status: "deleted" };
      },
      deleteRefreshCandidate: async () => { throw new Error("absent refresh candidates must not be deleted"); },
      removeGate: async ({ path, expectedHead }) => {
        if (gates.get(path) !== expectedHead) return { status: "refused" };
        gates.delete(path);
        return { status: "removed" };
      },
      deleteLocalMember: async ({ ref }) => {
        if (!localMembers.has(ref)) return { status: "adopted" };
        localMembers.delete(ref);
        return { status: "deleted" };
      },
      deleteRemoteMember: async ({ ref }) => {
        if (!remoteMembers.has(ref)) return { status: "adopted" };
        remoteMembers.delete(ref);
        return { status: "deleted" };
      },
      stateStore: { publish: async (_planId, value, revision) => {
        writes.push(value);
        return { status: "ok", value: { revision: revision + 1, value } };
      } },
    });

    expect(result).toMatchObject({ status: "reaped", state: { value: { activeOperation: null } } });
    expect({ localMembers: [...localMembers], remoteMembers: [...remoteMembers] })
      .toEqual({ localMembers: [], remoteMembers: [] });
    expect({ candidates: [...candidates], gates: [...gates] }).toEqual({ candidates: [], gates: [] });
    if (result.status === "reaped") expect(result.state.value.members).toEqual(state.members);
    expect(writes).toHaveLength(2);
  });

  it("reserves closeout before reaping every exact refresh candidate in the plan namespace", async () => {
    const { plan, state } = closeoutFixture();
    const stale = new Map([
      [`refs/arc/delivery-refresh-candidates/${plan.planId}/retired-member`, "7".repeat(40)],
      [`refs/arc/delivery-refresh-candidates/${plan.planId}/current-member`, "8".repeat(40)],
    ]);
    const writes: DeliveryStateV1[] = [];
    const events: string[] = [];
    const result = await reapCompletedDeliveryResidue({
      plan, current: { revision: 4, value: state }, gitCommonDir: "/repo/.git",
    }, {
      observeRefreshCandidates: async () => {
        events.push("observe-refresh");
        return ({
        status: "observed",
        candidates: [...stale].map(([ref, head]) => ({ ref, head })),
        });
      },
      observeCandidate: async () => ({ status: "absent" }),
      observeGate: async () => ({ status: "absent" }),
      deleteRefreshCandidate: async ({ ref, expectedHead }) => {
        events.push("delete-refresh");
        if (stale.get(ref) !== expectedHead) return { status: "refused" };
        stale.delete(ref);
        return { status: "deleted" };
      },
      deleteCandidate: async () => { throw new Error("absent candidates must not be deleted"); },
      removeGate: async () => { throw new Error("absent gates must not be removed"); },
      deleteLocalMember: async () => ({ status: "adopted" }),
      deleteRemoteMember: async () => ({ status: "adopted" }),
      stateStore: { publish: async (_planId, value, revision) => {
        events.push(value.activeOperation === null ? "publish-complete" : "publish-reservation");
        writes.push(value);
        return { status: "ok", value: { revision: revision + 1, value } };
      } },
    });

    expect(result.status).toBe("reaped");
    expect(stale.size).toBe(0);
    expect(writes).toHaveLength(2);
    expect(events.slice(0, 4)).toEqual([
      "publish-reservation", "observe-refresh", "delete-refresh", "delete-refresh",
    ]);
  });

  it("retains the closeout reservation when exact refresh-candidate deletion refuses", async () => {
    const { plan, state } = closeoutFixture();
    const ref = `refs/arc/delivery-refresh-candidates/${plan.planId}/stale-member`;
    let persisted: { revision: number; value: DeliveryStateV1 } | null = null;
    const result = await reapCompletedDeliveryResidue({
      plan, current: { revision: 4, value: state }, gitCommonDir: "/repo/.git",
    }, {
      observeRefreshCandidates: async () => ({
        status: "observed",
        candidates: [{ ref, head: "7".repeat(40) }],
      }),
      observeCandidate: async () => ({ status: "absent" }),
      observeGate: async () => ({ status: "absent" }),
      deleteRefreshCandidate: async () => ({ status: "refused" }),
      deleteCandidate: async () => { throw new Error("must not delete"); },
      removeGate: async () => { throw new Error("must not remove"); },
      deleteLocalMember: async () => { throw new Error("must not delete member"); },
      deleteRemoteMember: async () => { throw new Error("must not delete member"); },
      stateStore: { publish: async (_planId, value, revision) => {
        persisted = { revision: revision + 1, value };
        return { status: "ok", value: persisted };
      } },
    });

    expect(result).toMatchObject({
      status: "blocked",
      reason: "refresh-candidate-delete-refused",
      reservation: { revision: 5, value: { activeOperation: { kind: "teardown", mode: "closeout-residue" } } },
    });
    expect(persisted).not.toBeNull();
  });

  it("leaves mismatched candidate/gate evidence intact before reservation", async () => {
    const { plan, state, locators } = closeoutFixture();
    const first = locators[0]!;
    const candidates = new Map([[first.candidateRef, "7".repeat(40)]]);
    const gates = new Map([[first.gatePath, "8".repeat(40)]]);
    const result = await reapCompletedDeliveryResidue({
      plan, current: { revision: 4, value: state }, gitCommonDir: "/repo/.git",
    }, {
      observeRefreshCandidates: async () => ({ status: "observed", candidates: [] }),
      observeCandidate: async (ref) => candidates.has(ref)
        ? { status: "observed", head: candidates.get(ref)! }
        : { status: "absent" },
      observeGate: async (path) => gates.has(path)
        ? { status: "observed", head: gates.get(path)! }
        : { status: "absent" },
      deleteCandidate: async () => { throw new Error("must not delete"); },
      deleteRefreshCandidate: async () => { throw new Error("must not delete"); },
      removeGate: async () => { throw new Error("must not remove"); },
      deleteLocalMember: async () => { throw new Error("must not delete member"); },
      deleteRemoteMember: async () => { throw new Error("must not delete member"); },
      stateStore: { publish: async () => { throw new Error("must not reserve"); } },
    });
    expect(result).toEqual({
      status: "blocked", reason: "candidate-gate-mismatch", deliverableId: first.deliverableId,
    });
    expect({ candidates: [...candidates], gates: [...gates] }).toEqual({
      candidates: [[first.candidateRef, "7".repeat(40)]],
      gates: [[first.gatePath, "8".repeat(40)]],
    });
  });

  it("resumes from the exact reservation after candidate deletion but before gate removal", async () => {
    const { plan, state, locators } = closeoutFixture();
    const first = locators[0]!;
    const head = "7".repeat(40);
    const candidates = new Map([[first.candidateRef, head]]);
    const gates = new Map([[first.gatePath, head]]);
    let persisted: { revision: number; value: DeliveryStateV1 } = { revision: 4, value: state };
    let failGateOnce = true;
    const dependencies = {
      observeRefreshCandidates: async () => ({ status: "observed" as const, candidates: [] }),
      observeCandidate: async (ref: string) => candidates.has(ref)
        ? { status: "observed" as const, head: candidates.get(ref)! }
        : { status: "absent" as const },
      observeGate: async (path: string) => gates.has(path)
        ? { status: "observed" as const, head: gates.get(path)! }
        : { status: "absent" as const },
      deleteCandidate: async ({ ref, expectedHead }: { ref: string; expectedHead: string }) => {
        if (!candidates.has(ref)) return { status: "adopted" as const };
        if (candidates.get(ref) !== expectedHead) return { status: "refused" as const };
        candidates.delete(ref);
        return { status: "deleted" as const };
      },
      deleteRefreshCandidate: async () => {
        throw new Error("absent refresh candidates must not be deleted");
      },
      removeGate: async ({ path, expectedHead }: { path: string; expectedHead: string }) => {
        if (!gates.has(path)) return { status: "adopted" as const };
        if (gates.get(path) !== expectedHead || failGateOnce) {
          failGateOnce = false;
          return { status: "refused" as const };
        }
        gates.delete(path);
        return { status: "removed" as const };
      },
      deleteLocalMember: async () => ({ status: "adopted" as const }),
      deleteRemoteMember: async () => ({ status: "adopted" as const }),
      stateStore: { publish: async (_planId: string, value: DeliveryStateV1, revision: number) => {
        persisted = { revision: revision + 1, value };
        return { status: "ok" as const, value: persisted };
      } },
    };
    const interrupted = await reapCompletedDeliveryResidue({
      plan, current: persisted, gitCommonDir: "/repo/.git",
    }, dependencies);
    expect(interrupted).toMatchObject({ status: "blocked", reason: "gate-remove-refused" });
    expect(candidates.has(first.candidateRef)).toBe(false);
    expect(gates.has(first.gatePath)).toBe(true);
    expect(persisted.value.activeOperation).toMatchObject({
      kind: "teardown", mode: "closeout-residue",
    });
    expect(persisted.value.activeOperation?.kind === "teardown"
      ? persisted.value.activeOperation.candidateHeads[0]
      : null).toEqual({ deliverableId: first.deliverableId, head });

    await expect(reapCompletedDeliveryResidue({
      plan, current: persisted, gitCommonDir: "/repo/.git",
    }, dependencies)).resolves.toMatchObject({ status: "reaped", state: { value: { activeOperation: null } } });
    expect({ candidates: [...candidates], gates: [...gates] }).toEqual({ candidates: [], gates: [] });
  });
});

describe("delivery gate checkout", () => {
  const path = "/repo/.git/arc/delivery-gates/123e4567-e89b-42d3-a456-426614174000/member-one";
  const head = "7".repeat(40);

  it("ignores another checkout that only shares the expected head", async () => {
    const { exec } = scriptGitExec([
      { match: { prefix: ["worktree"] }, responses: [{
        stdout: `worktree /repo\0HEAD ${head}\0branch refs/heads/main\0\0worktree /tmp/other\0HEAD ${head}\0detached\0\0`,
      }] },
      { match: { prefix: [] }, responses: [{ stdout: "" }] },
    ]);
    await expect(observeDeliveryGateCheckout({
      exec, path, pathExists: async () => false,
    })).resolves.toEqual({ status: "absent" });
  });

  it("refuses attached, dirty, and wrong-head gates and removes only an exact clean detached gate", async () => {
    for (const gate of [
      { branch: "branch refs/heads/member-one", status: "", expectedHead: head, reason: "attached" },
      { branch: "detached", status: " M file.txt\n", expectedHead: head, reason: "dirty" },
      { branch: "detached", status: "", expectedHead: "8".repeat(40), reason: "head-mismatch" },
    ] as const) {
      let present = true;
      const exec: GitExec = async (_command, args) => {
        if (args[0] === "worktree" && args[1] === "list") {
          return present
            ? { stdout: `worktree ${path}\0HEAD ${head}\0${gate.branch}\0\0` }
            : { stdout: "" };
        }
        if (args[0] === "status") return { stdout: gate.status };
        if (args[0] === "worktree" && args[1] === "remove") {
          present = false;
          return { stdout: "" };
        }
        throw new Error("unexpected git operation");
      };
      await expect(removeDeliveryGateCheckout({
        exec,
        path,
        expectedHead: gate.expectedHead,
        pathExists: async () => present,
      })).resolves.toMatchObject({ status: "refused", reason: gate.reason });
      expect(present).toBe(true);
    }

    let present = true;
    const exec: GitExec = async (_command, args) => {
      if (args[0] === "worktree" && args[1] === "list") {
        return present
          ? { stdout: `worktree ${path}\0HEAD ${head}\0detached\0\0` }
          : { stdout: "" };
      }
      if (args[0] === "status") return { stdout: "" };
      if (args[0] === "worktree" && args[1] === "remove") {
        present = false;
        return { stdout: "" };
      }
      throw new Error("unexpected git operation");
    };
    await expect(removeDeliveryGateCheckout({
      exec, path, expectedHead: head, pathExists: async () => present,
    })).resolves.toEqual({ status: "removed" });
    expect(present).toBe(false);
    await expect(removeDeliveryGateCheckout({
      exec, path, expectedHead: head, pathExists: async () => present,
    })).resolves.toEqual({ status: "adopted" });
  });
});
