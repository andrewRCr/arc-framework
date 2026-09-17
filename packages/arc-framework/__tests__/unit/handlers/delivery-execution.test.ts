import { describe, expect, it, vi } from "vitest";

import { handleDeliveryExecution } from "../../../src/handlers/delivery-execution.js";
import { GitCommonStateAccessError } from "../../../src/lib/git-common-state.js";
import {
  deliveryFourMemberStackPlanFixture,
  deliverySingleMemberStackPlanFixture,
  deliveryStackPlanFixture,
  deliveryThreeMemberStackPlanFixture,
} from "../../fixtures/delivery-plan.js";
import { deliveryStateFixture } from "../../fixtures/delivery-state.js";

function publicationFields(plan: ReturnType<typeof deliveryStackPlanFixture>) {
  return {
    gateResults: plan.members.map((member, index) => ({
      deliverableId: member.deliverableId,
      head: String(index + 5).repeat(40),
      tree: String(index + 7).repeat(40),
      status: "passed",
    })),
    repository: "andrewRCr/arc-framework",
    draft: true,
    presentations: plan.members.slice(0, -1).map((member) => ({
      deliverableId: member.deliverableId,
      summary: `Review ${member.title}.`,
    })),
    terminalPresentation: {
      title: "feat(delivery): publish the work unit",
      body: "## Summary\n\nPublish the complete work unit.",
    },
  };
}

function standaloneRewriteRequest(plan = deliveryStackPlanFixture()) {
  const state = deliveryStateFixture(plan);
  const member = state.members[0]!;
  return {
    planId: plan.planId,
    deliverableId: member.deliverableId,
    requested: { target: state.target, members: [{ ...member }] },
  };
}

function eligibilityCloseRequest(plan = deliveryStackPlanFixture()) {
  const snapshot = {
    planId: plan.planId,
    workUnitId: plan.workUnitId,
    planRevision: plan.planRevision,
    planDigest: plan.planDigest,
    protectedBase: { ref: "refs/heads/main", head: "1".repeat(40), tree: "2".repeat(40) },
    chainBase: { head: "1".repeat(40), tree: "2".repeat(40) },
    predecessorRelation: {
      kind: "exact" as const,
      observedTip: "1".repeat(40),
      chainBase: "1".repeat(40),
    },
    top: { ref: "refs/heads/control", head: "3".repeat(40), tree: "4".repeat(40) },
    members: plan.members.map((member, index) => ({
      deliverableId: member.deliverableId,
      ref: `refs/heads/candidate-${index + 1}`,
      head: String(index + 5).repeat(40),
      tree: String(index + 7).repeat(40),
    })),
    lifecyclePaths: [".arc/active/meta-delivery-plan-record.md"],
    regenerablePaths: [],
  };
  return {
    snapshot,
    gateResults: snapshot.members.map(({ deliverableId, head, tree }) => ({
      deliverableId, head, tree, status: "passed" as const,
    })),
  };
}

describe("delivery execution handler", () => {
  it.each([
    ["candidate ref", { candidateRef: "refs/heads/foreign" }],
    ["protected-base ref", { protectedBaseRef: "refs/heads/foreign" }],
    ["lifecycle paths", { lifecyclePaths: ["caller.md"] }],
    ["selected-change exemption", { contributionMode: "selected-change" }],
    ["contribution endpoints", {
      contribution: {
        before: {
          predecessor: { head: "1".repeat(40), tree: "2".repeat(40) },
          member: { head: "3".repeat(40), tree: "4".repeat(40) },
        },
        after: {
          predecessor: { head: "5".repeat(40), tree: "6".repeat(40) },
          member: { head: "7".repeat(40), tree: "8".repeat(40) },
        },
      },
    }],
  ] as const)("rejects caller-authored standalone rewrite authority from %s", async (_label, authority) => {
    const execute = vi.fn();
    const write = vi.fn();
    await handleDeliveryExecution("rewrite", { input: "-", json: true }, undefined, {
      readText: vi.fn().mockResolvedValue(JSON.stringify({ ...standaloneRewriteRequest(), ...authority })),
      execute,
      write,
      setExitCode: vi.fn(),
    });
    expect(execute).not.toHaveBeenCalled();
    expect(JSON.parse(write.mock.calls[0]?.[0] as string)).toMatchObject({
      command: "delivery rewrite",
      status: "refused",
      reason: "invalid-command-input",
      detail: expect.any(String),
      coordinates: {
        planId: standaloneRewriteRequest().planId,
        deliverableId: standaloneRewriteRequest().deliverableId,
      },
      continuation: {
        kind: "remedy",
        argv: ["arc", "delivery", "rewrite", "--help"],
      },
    });
  });

  it("carries a non-default remote into standalone rewrite execution", async () => {
    const request = { ...standaloneRewriteRequest(), remote: "upstream" };
    const execute = vi.fn().mockRejectedValue(new Error("adapter failed"));
    await handleDeliveryExecution("rewrite", { input: "-", json: true }, undefined, {
      readText: vi.fn().mockResolvedValue(JSON.stringify(request)),
      execute,
      write: vi.fn(),
      setExitCode: vi.fn(),
    });

    expect(execute).toHaveBeenCalledWith("rewrite", request, undefined);
  });

  it("preserves a bounded standalone rewrite failure and decisive requested coordinates", async () => {
    const request = standaloneRewriteRequest();
    const write = vi.fn();
    await handleDeliveryExecution("rewrite", { input: "-", json: true }, undefined, {
      readText: vi.fn().mockResolvedValue(JSON.stringify(request)),
      execute: vi.fn().mockRejectedValue(new Error(`adapter\nfailed ${"x".repeat(5_000)}`)),
      write,
      setExitCode: vi.fn(),
    });
    const result = JSON.parse(write.mock.calls[0]?.[0] as string);
    expect(result).toMatchObject({
      command: "delivery rewrite",
      status: "refused",
      reason: "execution-unavailable",
      coordinates: {
        planId: request.planId,
        deliverableId: request.deliverableId,
        requestedBase: request.requested.members[0]!.coordinates!.base,
        requestedHead: request.requested.members[0]!.coordinates!.head,
      },
      continuation: { kind: "terminal-explanation" },
    });
    expect(result.detail).not.toContain("\n");
    expect(result.detail.length).toBeLessThanOrEqual(4_096);
  });

  it("projects eligibility-close refusal evidence through the public failure contract", async () => {
    const request = eligibilityCloseRequest();
    const observedHead = "9".repeat(40);
    const write = vi.fn();
    await handleDeliveryExecution("eligibility-close", { input: "-", json: true }, undefined, {
      readText: vi.fn().mockResolvedValue(JSON.stringify(request)),
      execute: vi.fn().mockResolvedValue({
        status: "refused",
        reason: "source-moved",
        source: {
          ref: request.snapshot.top.ref,
          expected: { head: request.snapshot.top.head, tree: request.snapshot.top.tree },
          observed: { head: observedHead, tree: "a".repeat(40) },
        },
        nextAction: {
          kind: "reprepare-delivery-eligibility",
          planId: request.snapshot.planId,
          protectedBaseRef: request.snapshot.protectedBase.ref,
          topRef: request.snapshot.top.ref,
          candidates: request.snapshot.members.map(({ deliverableId, ref }) => ({ deliverableId, ref })),
          lifecyclePaths: request.snapshot.lifecyclePaths,
        },
      }),
      write,
      setExitCode: vi.fn(),
    });
    expect(JSON.parse(write.mock.calls[0]?.[0] as string)).toMatchObject({
      command: "delivery eligibility close",
      status: "refused",
      reason: "source-moved",
      detail: "The delivery eligibility close operation stopped because source-moved.",
      coordinates: {
        planId: request.snapshot.planId,
        snapshotBaseHead: request.snapshot.protectedBase.head,
        snapshotTopHead: request.snapshot.top.head,
        observedHead,
      },
      continuation: { kind: "terminal-explanation" },
    });
  });

  it.each(["eligibility-prepare", "publish", "rematerialize"] as const)(
    "projects %s eligibility-consumer refusals through the public failure contract",
    async (command) => {
      const plan = deliveryStackPlanFixture();
      const close = eligibilityCloseRequest(plan);
      const request = command === "eligibility-prepare"
        ? {
            plan,
            protectedBaseRef: close.snapshot.protectedBase.ref,
            topRef: close.snapshot.top.ref,
            candidates: close.snapshot.members.map(({ deliverableId, ref }) => ({ deliverableId, ref })),
            lifecyclePaths: close.snapshot.lifecyclePaths,
          }
        : command === "publish"
          ? {
              planId: plan.planId,
              protectedBaseRef: close.snapshot.protectedBase.ref,
              topRef: close.snapshot.top.ref,
              candidates: close.snapshot.members.map(({ deliverableId, ref }) => ({
                deliverableId, ref, checkoutPath: `/tmp/${deliverableId}`,
              })),
              remote: "origin",
              ...publicationFields(plan),
            }
          : {
              planId: plan.planId,
              protectedBaseRef: close.snapshot.protectedBase.ref,
              topRef: close.snapshot.top.ref,
              selectedDeliverableIds: [plan.members[0]!.deliverableId],
              repository: "owner/repo",
              remote: "origin",
            };
      const write = vi.fn();
      await handleDeliveryExecution(command, { input: "-", json: true }, undefined, {
        readText: vi.fn().mockResolvedValue(JSON.stringify(request)),
        execute: vi.fn().mockResolvedValue({ status: "refused", reason: "lifecycle-paths-moved" }),
        write,
        setExitCode: vi.fn(),
      });
      expect(JSON.parse(write.mock.calls[0]?.[0] as string)).toMatchObject({
        command: command === "eligibility-prepare"
          ? "delivery eligibility prepare"
          : `delivery ${command}`,
        status: "refused",
        reason: "lifecycle-paths-moved",
        detail: expect.any(String),
        coordinates: { planId: plan.planId },
        continuation: { kind: "terminal-explanation" },
      });
    },
  );

  it("preserves a typed landing refusal and bounded provider cause through the public envelope", async () => {
    const plan = deliveryStackPlanFixture();
    const deliverableId = plan.members[0]!.deliverableId;
    const result = {
      status: "refused" as const,
      reason: "landing-refused" as const,
      cause: {
        stage: "merge-submission" as const,
        reason: "unavailable" as const,
        provider: { kind: "http" as const, status: 422, exitCode: 1 },
      },
    };
    const write = vi.fn();
    await handleDeliveryExecution("land-apply", { input: "-", json: true }, undefined, {
      readText: vi.fn().mockResolvedValue(JSON.stringify({
        planId: plan.planId,
        approved: {
          operationId: "operation-landing",
          planId: plan.planId,
          deliverableId,
          head: "a".repeat(40),
          repository: "owner/repo",
          changeRequestId: "401",
          mergeStrategy: "merge",
          settledReviewState: "settled",
          consequence: "Merge one exact delivery member.",
          releaseMergeLock: true,
        },
        remote: "origin",
        treeRoot: ".",
      })),
      execute: vi.fn().mockResolvedValue(result),
      write,
      setExitCode: vi.fn(),
    });

    expect(JSON.parse(write.mock.calls[0]?.[0] as string)).toEqual({
      schemaVersion: 1,
      command: "delivery land apply",
      ...result,
    });
  });

  it("preserves explicit delivery-closeout identity and continuation text", async () => {
    const write = vi.fn();
    const recommendedActionText =
      "Delivery closeout is complete for `delivery-plan-record`. Continue with ordinary work-unit teardown.";
    await handleDeliveryExecution("closeout", { input: "-", json: true }, undefined, {
      readText: vi.fn().mockResolvedValue(JSON.stringify({
        workUnitId: "delivery-plan-record",
        repository: "owner/repo",
        remote: "upstream",
      })),
      execute: vi.fn().mockResolvedValue({
        status: "closed-out",
        workUnitId: "delivery-plan-record",
        planIds: ["123e4567-e89b-42d3-a456-426614174000"],
        recommendedActionText,
      }),
      write,
      setExitCode: vi.fn(),
    });

    expect(JSON.parse(write.mock.calls[0]?.[0] as string)).toEqual({
      schemaVersion: 1,
      command: "delivery closeout",
      status: "closed-out",
      workUnitId: "delivery-plan-record",
      planIds: ["123e4567-e89b-42d3-a456-426614174000"],
      recommendedActionText,
    });
  });

  it("preserves detailed delivery-closeout refusals through the strict result envelope", async () => {
    const plan = deliveryStackPlanFixture();
    const deliverableId = plan.members[0]!.deliverableId;
    const write = vi.fn();
    const recommendedActionText =
      "Delivery closeout stopped: reap-candidate-head-mismatch. Resolve the exact reported state and rerun closeout.";
    await handleDeliveryExecution("closeout", { input: "-", json: true }, undefined, {
      readText: vi.fn().mockResolvedValue(JSON.stringify({
        workUnitId: plan.workUnitId,
        repository: "owner/repo",
        remote: "upstream",
      })),
      execute: vi.fn().mockResolvedValue({
        status: "blocked",
        reason: "reap-candidate-head-mismatch",
        planId: plan.planId,
        deliverableId,
        recommendedActionText,
      }),
      write,
      setExitCode: vi.fn(),
    });

    expect(JSON.parse(write.mock.calls[0]?.[0] as string)).toEqual({
      schemaVersion: 1,
      command: "delivery closeout",
      status: "blocked",
      reason: "reap-candidate-head-mismatch",
      planId: plan.planId,
      deliverableId,
      recommendedActionText,
    });
  });

  it("preserves deterministic authoring locators through a strict read-only verb", async () => {
    const plan = deliveryStackPlanFixture();
    const locators = plan.members.map((member) => ({
      deliverableId: member.deliverableId,
      candidateRef: `refs/arc/delivery-candidates/${plan.planId}/${member.chunkKey}`,
      gatePath: `/repo/.git/arc/delivery-gates/${plan.planId}/${member.chunkKey}`,
    }));
    const write = vi.fn();
    await handleDeliveryExecution("authoring-locate", { input: "-", json: true }, undefined, {
      readText: vi.fn().mockResolvedValue(JSON.stringify({ planId: plan.planId })),
      execute: vi.fn().mockResolvedValue({ status: "located", planId: plan.planId, locators }),
      write,
      setExitCode: vi.fn(),
    });
    expect(JSON.parse(write.mock.calls[0]?.[0] as string)).toEqual({
      schemaVersion: 1,
      command: "delivery authoring locate",
      status: "located",
      planId: plan.planId,
      locators,
    });
  });

  it("exposes the authoring rematerialize executor as a strict verb", async () => {
    const plan = deliveryStackPlanFixture();
    const member = plan.members[0]!;
    const request = {
      repository: "owner/repo",
      remote: "origin",
      derivedFrom: { kind: "open-task", taskId: "1.1", leafTaskId: "1.1.R.a" },
      route: "provider-refresh",
      affectedDeliverableIds: [member.deliverableId],
      requiredAncestorHeads: ["1".repeat(40)],
      requiredFindingPaths: [],
      planId: plan.planId,
      selectedDeliverableId: member.deliverableId,
      expectedStateRevision: 3,
      ref: `refs/arc/delivery-candidates/${plan.planId}/${member.chunkKey}`,
      checkoutPath: `/repo/.git/arc/delivery-gates/${plan.planId}/${member.chunkKey}`,
      beforeHead: null,
      beforeTree: null,
      requestedHead: "1".repeat(40),
      requestedTree: "2".repeat(40),
    };
    const write = vi.fn();
    await handleDeliveryExecution("authoring-rematerialize", { input: "-", json: true }, undefined, {
      readText: vi.fn().mockResolvedValue(JSON.stringify(request)),
      execute: vi.fn().mockResolvedValue({ status: "rematerialized" }),
      write,
      setExitCode: vi.fn(),
    });
    expect(JSON.parse(write.mock.calls[0]?.[0] as string)).toEqual({
      schemaVersion: 1,
      command: "delivery authoring rematerialize",
      status: "rematerialized",
    });
  });

  it("exposes the authoring rebind executor as a strict verb and preserves its replay", async () => {
    const plan = deliveryStackPlanFixture();
    const member = plan.members[0]!;
    const request = {
      repository: "owner/repo",
      remote: "origin",
      derivedFrom: { kind: "open-task", taskId: "1.1", leafTaskId: "1.1.R.a" },
      route: "provider-refresh",
      affectedDeliverableIds: [member.deliverableId],
      requiredFindingPaths: [],
      planId: plan.planId,
      selectedDeliverableId: member.deliverableId,
      expectedStateRevision: 3,
      ref: `refs/arc/delivery-candidates/${plan.planId}/${member.chunkKey}`,
      checkoutPath: `/repo/.git/arc/delivery-gates/${plan.planId}/${member.chunkKey}`,
      beforeHead: "1".repeat(40),
      beforeTree: "2".repeat(40),
      requestedHead: "3".repeat(40),
      requestedTree: "4".repeat(40),
      publishedHead: "1".repeat(40),
      publishedTree: "2".repeat(40),
      requiredAncestorHeads: ["1".repeat(40)],
    };
    const write = vi.fn();
    await handleDeliveryExecution("authoring-rebind", { input: "-", json: true }, undefined, {
      readText: vi.fn().mockResolvedValue(JSON.stringify(request)),
      execute: vi.fn().mockResolvedValue({ status: "already-rebound", replayed: true }),
      write,
      setExitCode: vi.fn(),
    });
    expect(JSON.parse(write.mock.calls[0]?.[0] as string)).toEqual({
      schemaVersion: 1,
      command: "delivery authoring rebind",
      status: "already-rebound",
      replayed: true,
    });
  });

  it("refuses a malformed authoring rebind request before execution", async () => {
    const execute = vi.fn();
    const write = vi.fn();
    const setExitCode = vi.fn();
    await handleDeliveryExecution("authoring-rebind", { input: "-", json: true }, undefined, {
      readText: vi.fn().mockResolvedValue(JSON.stringify({
        planId: deliveryStackPlanFixture().planId,
        ref: "refs/arc/delivery-candidates/plan/first",
      })),
      execute,
      write,
      setExitCode,
    });
    expect(execute).not.toHaveBeenCalled();
    expect(JSON.parse(write.mock.calls[0]?.[0] as string)).toEqual({
      schemaVersion: 1,
      command: "delivery authoring rebind",
      status: "refused",
      reason: "invalid-command-input",
    });
    expect(setExitCode).toHaveBeenCalledWith(1);
  });

  it("preserves a prepared service result through the strict verb envelope", async () => {
    const plan = deliveryStackPlanFixture();
    const snapshot = {
      planId: plan.planId,
      workUnitId: plan.workUnitId,
      planRevision: plan.planRevision,
      planDigest: plan.planDigest,
      protectedBase: { ref: "refs/heads/main", head: "1".repeat(40), tree: "2".repeat(40) },
      chainBase: { head: "1".repeat(40), tree: "2".repeat(40) },
      predecessorRelation: {
        kind: "exact",
        observedTip: "1".repeat(40),
        chainBase: "1".repeat(40),
      },
      top: { ref: "refs/heads/control", head: "3".repeat(40), tree: "4".repeat(40) },
      members: plan.members.map((member, index) => ({
        deliverableId: member.deliverableId,
        ref: `refs/heads/candidate-${index + 1}`,
        head: String(index + 5).repeat(40),
        tree: String(index + 7).repeat(40),
      })),
      lifecyclePaths: [".arc/active/meta-delivery-plan-record.md"],
      regenerablePaths: [],
    };
    const write = vi.fn();
    const setExitCode = vi.fn();
    const execute = vi.fn().mockResolvedValue({ status: "prepared", snapshot });
    await handleDeliveryExecution("eligibility-prepare", { input: "-", json: true }, undefined, {
      readText: vi.fn().mockResolvedValue(JSON.stringify({
        plan,
        protectedBaseRef: "refs/heads/main",
        topRef: "refs/heads/control",
        candidates: snapshot.members.map(({ deliverableId, ref }) => ({ deliverableId, ref })),
        lifecyclePaths: snapshot.lifecyclePaths,
      })),
      execute,
      write,
      setExitCode,
    });
    expect(execute).toHaveBeenCalledOnce();
    expect(JSON.parse(write.mock.calls[0]?.[0] as string)).toEqual({
      schemaVersion: 1,
      command: "delivery eligibility prepare",
      status: "prepared",
      snapshot,
    });
    expect(setExitCode).not.toHaveBeenCalled();
  });

  it("rejects the retired control-ref spelling at the eligibility boundary", async () => {
    const plan = deliveryStackPlanFixture();
    const execute = vi.fn();
    const write = vi.fn();
    await handleDeliveryExecution("eligibility-prepare", { input: "-", json: true }, undefined, {
      readText: vi.fn().mockResolvedValue(JSON.stringify({
        plan,
        protectedBaseRef: "refs/heads/main",
        topRef: "refs/heads/feat/example",
        controlRef: "refs/heads/feat/example",
        candidates: plan.members.map((member, index) => ({
          deliverableId: member.deliverableId,
          ref: `refs/heads/candidate-${index + 1}`,
        })),
        lifecyclePaths: [],
      })),
      execute,
      write,
      setExitCode: vi.fn(),
    });
    expect(execute).not.toHaveBeenCalled();
    expect(JSON.parse(write.mock.calls[0]?.[0] as string)).toMatchObject({
      status: "refused",
      reason: "invalid-command-input",
    });
  });

  it("rejects malformed input before execution and invalid service output at the boundary", async () => {
    const state = deliveryStateFixture();
    const execute = vi.fn();
    const firstWrite = vi.fn();
    await handleDeliveryExecution("position", { input: "-" }, undefined, {
      readText: vi.fn().mockResolvedValue(JSON.stringify({
        planId: state.planId,
        facts: { target: state.target, members: state.members, landedDeliverableIds: [] },
      })),
      execute,
      write: firstWrite,
      setExitCode: vi.fn(),
    });
    expect(execute).not.toHaveBeenCalled();
    expect(JSON.parse(firstWrite.mock.calls[0]?.[0] as string).reason).toBe("invalid-command-input");

    const secondWrite = vi.fn();
    await handleDeliveryExecution("position", { input: "-" }, undefined, {
      readText: vi.fn().mockResolvedValue(JSON.stringify({
        planId: state.planId,
        repository: "owner/repo",
        remote: "origin",
      })),
      execute: vi.fn().mockResolvedValue({ status: "invented" }),
      write: secondWrite,
      setExitCode: vi.fn(),
    });
    expect(JSON.parse(secondWrite.mock.calls[0]?.[0] as string)).toEqual({
      schemaVersion: 1,
      command: "delivery position",
      status: "refused",
      reason: "invalid-service-result",
      detail: "Strict delivery result validation failed for status 'invented'; observed fields: status.",
      recommendedActionText:
        "Treat the delivery outcome as unknown. Inspect current delivery recovery state before retrying, and report this ARC contract mismatch.",
    });
  });

  it("keeps read and execution failures inside the command envelope", async () => {
    const readExecute = vi.fn();
    const readWrite = vi.fn();
    const readExit = vi.fn();
    await handleDeliveryExecution("position", { input: "-" }, undefined, {
      readText: vi.fn().mockRejectedValue(new Error("read failed")),
      execute: readExecute,
      write: readWrite,
      setExitCode: readExit,
    });
    expect(readExecute).not.toHaveBeenCalled();
    expect(JSON.parse(readWrite.mock.calls[0]?.[0] as string)).toMatchObject({
      status: "refused",
      reason: "invalid-command-input",
    });
    expect(readExit).toHaveBeenCalledWith(1);

    const state = deliveryStateFixture();
    const executeWrite = vi.fn();
    const executeExit = vi.fn();
    await handleDeliveryExecution("position", { input: "-" }, undefined, {
      readText: vi.fn().mockResolvedValue(JSON.stringify({
        planId: state.planId,
        repository: "owner/repo",
        remote: "origin",
      })),
      execute: vi.fn().mockRejectedValue(new Error("execution failed")),
      write: executeWrite,
      setExitCode: executeExit,
    });
    expect(JSON.parse(executeWrite.mock.calls[0]?.[0] as string)).toMatchObject({
      status: "refused",
      reason: "execution-unavailable",
    });
    expect(executeExit).toHaveBeenCalledWith(1);
  });

  it("surfaces a repository-state write denial with an actionable typed remedy", async () => {
    const state = deliveryStateFixture();
    const write = vi.fn();
    const setExitCode = vi.fn();

    await handleDeliveryExecution("position", { input: "-" }, undefined, {
      readText: vi.fn().mockResolvedValue(JSON.stringify({
        planId: state.planId,
        repository: "owner/repo",
        remote: "origin",
      })),
      execute: vi.fn().mockRejectedValue(
        new GitCommonStateAccessError("write", "read-only-filesystem"),
      ),
      write,
      setExitCode,
    });

    expect(JSON.parse(write.mock.calls[0]?.[0] as string)).toEqual({
      schemaVersion: 1,
      command: "delivery position",
      status: "refused",
      reason: "operational-state-not-writable",
      storage: "repository-git-common",
      cause: "read-only-filesystem",
      recommendedActionText:
        "ARC could not write repository-scoped operational state in the repository's shared Git metadata because "
        + "the filesystem is read-only. Ensure the invoking process can write the logical repository, including "
        + "its shared Git directory, or use its approved elevated-execution path, then retry.",
    });
    expect(setExitCode).toHaveBeenCalledWith(1);
  });

  it("surfaces a repository-state read denial with an actionable typed remedy", async () => {
    const state = deliveryStateFixture();
    const write = vi.fn();

    await handleDeliveryExecution("position", { input: "-" }, undefined, {
      readText: vi.fn().mockResolvedValue(JSON.stringify({
        planId: state.planId,
        repository: "owner/repo",
        remote: "origin",
      })),
      execute: vi.fn().mockRejectedValue(
        new GitCommonStateAccessError("read", "permission-denied"),
      ),
      write,
      setExitCode: vi.fn(),
    });

    expect(JSON.parse(write.mock.calls[0]?.[0] as string)).toEqual({
      schemaVersion: 1,
      command: "delivery position",
      status: "refused",
      reason: "operational-state-not-readable",
      storage: "repository-git-common",
      cause: "permission-denied",
      recommendedActionText:
        "ARC could not read repository-scoped operational state from the repository's shared Git metadata because "
        + "the process was denied access. Ensure the invoking process can read the logical repository, including "
        + "its shared Git directory, then retry.",
    });
  });

  it("preserves an operator refresh plan through its strict command envelope", async () => {
    const plan = deliveryStackPlanFixture();
    const plannedSuffix = plan.members.slice(0, -1).map(({ deliverableId }) => deliverableId);
    const write = vi.fn();

    await handleDeliveryExecution("refresh-plan", { input: "-", json: true }, undefined, {
      readText: vi.fn().mockResolvedValue(JSON.stringify({
        planId: plan.planId,
        repository: "owner/repo",
        trigger: { kind: "landing-refused", reason: "host-up-to-date" },
        remote: "origin",
      })),
      execute: vi.fn().mockResolvedValue({
        status: "refresh-required",
        mechanics: "operator-initiated",
        plannedSuffix,
        recommendedActionText: "Refresh the exact registered suffix, then adopt its observed result.",
      }),
      write,
      setExitCode: vi.fn(),
    });

    expect(JSON.parse(write.mock.calls[0]?.[0] as string)).toMatchObject({
      command: "delivery refresh plan",
      status: "refresh-required",
      mechanics: "operator-initiated",
      plannedSuffix,
    });
  });

  it("preserves provider-neutral review-fix planning and selected publication continuations", async () => {
    const plan = deliveryStackPlanFixture();
    const state = deliveryStateFixture(plan);
    const selectedDeliverableId = plan.members[0]!.deliverableId;
    const affectedDeliverableIds = plan.members.slice(0, -1).map(({ deliverableId }) => deliverableId);
    const planRequest = JSON.stringify({
      planId: plan.planId,
      selectedDeliverableId,
      repository: "owner/repo",
      entryMode: "execution",
    });
    const planned = {
      status: "planned" as const,
      route: "provider-refresh" as const,
      selectedDeliverableId,
      affectedDeliverableIds,
      nextAction: "publish-selected-member" as const,
      candidateRequirements: {
        requiredAncestorHeads: [state.members[0]!.coordinates!.head],
      },
      recommendedActionText: "Publish the selected member, refresh externally, then adopt.",
    };
    const planWrite = vi.fn();
    await handleDeliveryExecution("review-fix-plan", { input: "-", json: true }, undefined, {
      readText: vi.fn().mockResolvedValue(planRequest),
      execute: vi.fn().mockResolvedValue(planned),
      write: planWrite,
      setExitCode: vi.fn(),
    });
    expect(JSON.parse(planWrite.mock.calls[0]?.[0] as string)).toEqual({
      schemaVersion: 1,
      command: "delivery review-fix plan",
      ...planned,
    });

    const published = {
      status: "published" as const,
      state: { revision: 8, value: state },
      selectedDeliverableId,
      affectedDeliverableIds,
      nextAction: "execute-provider-refresh" as const,
      verification: { memberDeliverableIds: [selectedDeliverableId], tier1Required: true as const },
      recommendedActionText: "Refresh externally, then adopt.",
    };
    const publishWrite = vi.fn();
    await handleDeliveryExecution("review-fix-publish", { input: "-", json: true }, undefined, {
      readText: vi.fn().mockResolvedValue(JSON.stringify({
        planId: plan.planId,
        selectedDeliverableId,
        repository: "owner/repo",
        remote: "origin",
      })),
      execute: vi.fn().mockResolvedValue(published),
      write: publishWrite,
      setExitCode: vi.fn(),
    });
    expect(JSON.parse(publishWrite.mock.calls[0]?.[0] as string)).toEqual({
      schemaVersion: 1,
      command: "delivery review-fix publish",
      ...published,
    });
  });

  it("preserves one selector-free resumable review-fix continuation action", async () => {
    const request = { repository: "owner/repo", remote: "origin" };
    const selectedDeliverableId = deliveryStackPlanFixture().members[0]!.deliverableId;
    const result = {
      status: "dispatch" as const,
      nextAction: "dispatch" as const,
      action: {
        kind: "delivery-review-fix-publish" as const,
        argv: ["arc", "delivery", "review-fix", "publish", "-", "--json"] as const,
        input: {
          planId: "11111111-1111-4111-8111-111111111111",
          selectedDeliverableId,
          repository: "owner/repo",
          remote: "origin",
        },
      },
      recommendedActionText: "Dispatch the exact action, then invoke this continuation again.",
    };
    const execute = vi.fn().mockResolvedValue(result);
    const write = vi.fn();

    await handleDeliveryExecution("review-fix-continue" as never, { input: "-", json: true }, undefined, {
      readText: vi.fn().mockResolvedValue(JSON.stringify(request)),
      execute,
      write,
      setExitCode: vi.fn(),
    });

    expect(execute).toHaveBeenCalledWith("review-fix-continue", request, undefined);
    expect(JSON.parse(write.mock.calls[0]?.[0] as string)).toEqual({
      schemaVersion: 1,
      command: "delivery review-fix continue",
      ...result,
    });
  });

  it("preserves the exact review-fix verification acknowledgement envelope", async () => {
    const plan = deliveryStackPlanFixture();
    const selectedDeliverableId = plan.members[0]!.deliverableId;
    const state = deliveryStateFixture(plan);
    const request = {
      planId: plan.planId,
      selectedDeliverableId,
      memberDeliverableIds: [selectedDeliverableId],
      expectedStateRevision: 9,
      continuationDigest: `sha256:${"f".repeat(64)}`,
      verification: {
        applicability: "focused",
        target: {
          head: state.members.at(-1)!.coordinates!.head,
          tree: state.members.at(-1)!.coordinates!.tree,
        },
        tier1: {
          outcome: "passed",
          provenance: "exact-tree-reuse",
          targetTree: state.members.at(-1)!.coordinates!.tree,
          coveredInputs: "unchanged",
        },
        verificationEvidenceRefs: ["criteria://member", "gates://tier-1"],
      },
    };
    const acknowledged = {
      status: "acknowledged" as const,
      state: { revision: 10, value: state },
      candidate: {
        candidateId: `sha256:${"a".repeat(64)}`,
        verificationId: `sha256:${"b".repeat(64)}`,
        recordPath: ".arc/system/.internal/candidates/example.json",
      },
      nextAction: "resolve-delivery-status" as const,
      boundaryCarry: {
        path: `.arc/system/.internal/candidates/${plan.workUnitId}.boundary.json`,
        candidateId: `sha256:${"a".repeat(64)}`,
        stateRevision: 10,
      },
      recordEffects: [
        {
          path: ".arc/system/.internal/candidates/example.json",
          digest: `sha256:${"c".repeat(64)}`,
        },
        {
          path: `.arc/system/.internal/candidates/${plan.workUnitId}.boundary.json`,
          digest: `sha256:${"d".repeat(64)}`,
        },
      ],
    };
    const execute = vi.fn().mockResolvedValue(acknowledged);
    const write = vi.fn();

    await handleDeliveryExecution("review-fix-acknowledge", { input: "-", json: true }, undefined, {
      readText: vi.fn().mockResolvedValue(JSON.stringify(request)),
      execute,
      write,
      setExitCode: vi.fn(),
    });

    expect(execute).toHaveBeenCalledWith("review-fix-acknowledge", request, undefined);
    expect(JSON.parse(write.mock.calls[0]?.[0] as string)).toEqual({
      schemaVersion: 1,
      command: "delivery review-fix acknowledge",
      ...acknowledged,
    });
  });

  it("preserves refresh adoption while deriving the suffix behind the strict request boundary", async () => {
    const plan = deliveryStackPlanFixture();
    const state = deliveryStateFixture(plan);
    const execute = vi.fn().mockResolvedValue({
      status: "applied",
      state: { revision: 3, value: state },
    });
    const write = vi.fn();

    await handleDeliveryExecution("refresh-adopt", { input: "-", json: true }, undefined, {
      readText: vi.fn().mockResolvedValue(JSON.stringify({
        planId: plan.planId,
        repository: "owner/repo",
        remote: "origin",
      })),
      execute,
      write,
      setExitCode: vi.fn(),
    });

    expect(execute).toHaveBeenCalledOnce();
    expect(JSON.parse(write.mock.calls[0]?.[0] as string)).toEqual({
      schemaVersion: 1,
      command: "delivery refresh adopt",
      status: "applied",
      state: { revision: 3, value: state },
    });
  });

  it("preserves the exact external conflict-resolution offer and resubmission input", async () => {
    const plan = deliveryFourMemberStackPlanFixture();
    const selectedDeliverableId = plan.members[0]!.deliverableId;
    const conflictedDeliverableId = plan.members[1]!.deliverableId;
    const conflicts = [{ deliverableId: conflictedDeliverableId, paths: ["shared.txt"] }];
    const resolutionInput = {
      planId: plan.planId,
      scope: { kind: "dependent-suffix" as const, selectedDeliverableId },
      expectedStateRevision: 7,
      observedSuffixDigest: `sha256:${"e".repeat(64)}`,
      conflicts,
    };
    const request = {
      planId: plan.planId,
      repository: "owner/repo",
      remote: "origin",
      scope: { kind: "dependent-suffix" as const, selectedDeliverableId },
      conflictResolution: resolutionInput,
    };
    const result = {
      status: "conflict-resolution-required" as const,
      conflicts,
      resolutionInput,
      externalRefRestorations: [{
        ref: "refs/heads/dependent",
        observedHead: "a".repeat(40),
        restoreHead: "b".repeat(40),
      }],
      recommendedActionText: "Obtain explicit approval or restore the exact refs.",
    };
    const execute = vi.fn().mockResolvedValue(result);
    const write = vi.fn();

    await handleDeliveryExecution("refresh-adopt", { input: "-", json: true }, undefined, {
      readText: vi.fn().mockResolvedValue(JSON.stringify(request)),
      execute,
      write,
      setExitCode: vi.fn(),
    });

    expect(execute).toHaveBeenCalledWith("refresh-adopt", request, undefined);
    expect(JSON.parse(write.mock.calls[0]?.[0] as string)).toEqual({
      schemaVersion: 1,
      command: "delivery refresh adopt",
      ...result,
    });
  });

  it("rejects pathless external conflict consent at both strict boundaries", async () => {
    const plan = deliveryFourMemberStackPlanFixture();
    const selectedDeliverableId = plan.members[0]!.deliverableId;
    const conflictedDeliverableId = plan.members[1]!.deliverableId;
    const conflicts = [{ deliverableId: conflictedDeliverableId, paths: [] }];
    const resolutionInput = {
      planId: plan.planId,
      scope: { kind: "dependent-suffix" as const, selectedDeliverableId },
      expectedStateRevision: 7,
      observedSuffixDigest: `sha256:${"e".repeat(64)}`,
      conflicts,
    };
    const execute = vi.fn();
    const invalidInputWrite = vi.fn();

    await handleDeliveryExecution("refresh-adopt", { input: "-", json: true }, undefined, {
      readText: vi.fn().mockResolvedValue(JSON.stringify({
        planId: plan.planId,
        repository: "owner/repo",
        remote: "origin",
        scope: { kind: "dependent-suffix", selectedDeliverableId },
        conflictResolution: resolutionInput,
      })),
      execute,
      write: invalidInputWrite,
      setExitCode: vi.fn(),
    });

    expect(execute).not.toHaveBeenCalled();
    expect(JSON.parse(invalidInputWrite.mock.calls[0]?.[0] as string)).toMatchObject({
      status: "refused",
      reason: "invalid-command-input",
    });

    const invalidOutputWrite = vi.fn();
    await handleDeliveryExecution("refresh-adopt", { input: "-", json: true }, undefined, {
      readText: vi.fn().mockResolvedValue(JSON.stringify({
        planId: plan.planId,
        repository: "owner/repo",
        remote: "origin",
        scope: { kind: "dependent-suffix", selectedDeliverableId },
      })),
      execute: vi.fn().mockResolvedValue({
        status: "conflict-resolution-required",
        conflicts,
        resolutionInput,
        externalRefRestorations: [{
          ref: "refs/heads/dependent",
          observedHead: "a".repeat(40),
          restoreHead: "b".repeat(40),
        }],
        recommendedActionText: "Resolve the conflict or restore the exact refs.",
      }),
      write: invalidOutputWrite,
      setExitCode: vi.fn(),
    });

    expect(JSON.parse(invalidOutputWrite.mock.calls[0]?.[0] as string)).toMatchObject({
      status: "refused",
      reason: "invalid-service-result",
    });
  });

  it("preserves fresh and recovery provider-refresh execution through the strict command envelope", async () => {
    const plan = deliveryStackPlanFixture();
    const state = deliveryStateFixture(plan);
    const selectedDeliverableId = plan.members[0]!.deliverableId;
    const applied = {
      status: "applied" as const,
      state: { revision: 4, value: state },
    };
    const freshExecute = vi.fn().mockResolvedValue(applied);
    const freshWrite = vi.fn();

    await handleDeliveryExecution("refresh-execute", { input: "-", json: true }, undefined, {
      readText: vi.fn().mockResolvedValue(JSON.stringify({
        planId: plan.planId,
        repository: "owner/repo",
        remote: "origin",
        scope: { kind: "dependent-suffix", selectedDeliverableId },
      })),
      execute: freshExecute,
      write: freshWrite,
      setExitCode: vi.fn(),
    });

    expect(freshExecute).toHaveBeenCalledOnce();
    expect(JSON.parse(freshWrite.mock.calls[0]?.[0] as string)).toEqual({
      schemaVersion: 1,
      command: "delivery refresh execute",
      ...applied,
    });

    const reservation = {
      ...state,
      activeOperation: {
        operationId: "provider-refresh-operation",
        kind: "rewrite" as const,
        mode: "provider-refresh" as const,
        affectedDeliverableIds: [selectedDeliverableId],
        stateRevision: 3,
        boundPlanDigest: state.boundPlan.planDigest,
        before: { target: state.target, members: [state.members[0]!] },
        requested: { target: state.target, members: [state.members[0]!] },
      },
    };
    const retryable = {
      status: "retryable" as const,
      reason: "collision",
      publication: { status: "retry" as const, pendingDeliverableIds: [selectedDeliverableId] },
      reservation: { revision: 4, value: reservation },
    };
    const recoveryWrite = vi.fn();
    await handleDeliveryExecution("refresh-execute", { input: "-", json: true }, undefined, {
      readText: vi.fn().mockResolvedValue(JSON.stringify({
        planId: plan.planId,
        repository: "owner/repo",
        remote: "origin",
        operationId: "provider-refresh-operation",
      })),
      execute: vi.fn().mockResolvedValue(retryable),
      write: recoveryWrite,
      setExitCode: vi.fn(),
    });
    expect(JSON.parse(recoveryWrite.mock.calls[0]?.[0] as string)).toEqual({
      schemaVersion: 1,
      command: "delivery refresh execute",
      ...retryable,
    });

    const retainedBlock = {
      status: "blocked" as const,
      reason: "observation-unavailable",
      operationId: "provider-refresh-operation",
      nextAction: "reconcile" as const,
      recommendedActionText:
        "The provider-refresh reservation remains active. Run `arc delivery reconcile` and retry its exact selector.",
    };
    const blockedWrite = vi.fn();
    await handleDeliveryExecution("refresh-execute", { input: "-", json: true }, undefined, {
      readText: vi.fn().mockResolvedValue(JSON.stringify({
        planId: plan.planId,
        repository: "owner/repo",
        remote: "origin",
        operationId: "provider-refresh-operation",
      })),
      execute: vi.fn().mockResolvedValue(retainedBlock),
      write: blockedWrite,
      setExitCode: vi.fn(),
    });
    expect(JSON.parse(blockedWrite.mock.calls[0]?.[0] as string)).toEqual({
      schemaVersion: 1,
      command: "delivery refresh execute",
      ...retainedBlock,
    });

    const retainedConflict = {
      status: "blocked" as const,
      reason: "content-conflict",
      paths: ["shared.txt"],
      operationId: "provider-refresh-operation",
      nextAction: "resolve-terminal-conflicts" as const,
      recommendedActionText:
        "The provider-refresh reservation remains active. Resolve the listed terminal predecessor conflicts as "
        + "one exact two-parent absorption commit, then run `arc delivery reconcile` and retry its exact selector.",
    };
    const conflictWrite = vi.fn();
    await handleDeliveryExecution("refresh-execute", { input: "-", json: true }, undefined, {
      readText: vi.fn().mockResolvedValue(JSON.stringify({
        planId: plan.planId,
        repository: "owner/repo",
        remote: "origin",
        operationId: "provider-refresh-operation",
      })),
      execute: vi.fn().mockResolvedValue(retainedConflict),
      write: conflictWrite,
      setExitCode: vi.fn(),
    });
    expect(JSON.parse(conflictWrite.mock.calls[0]?.[0] as string)).toEqual({
      schemaVersion: 1,
      command: "delivery refresh execute",
      ...retainedConflict,
    });
  });

  it("preserves actionable provider preparation detail through the strict result envelope", async () => {
    const plan = deliveryStackPlanFixture();
    const selectedDeliverableId = plan.members[0]!.deliverableId;
    const refusal = {
      status: "refused" as const,
      reason: "unavailable",
      detail: "could not determine the previous base; rebase this branch manually",
    };
    const write = vi.fn();

    await handleDeliveryExecution("refresh-execute", { input: "-", json: true }, undefined, {
      readText: vi.fn().mockResolvedValue(JSON.stringify({
        planId: plan.planId,
        repository: "owner/repo",
        remote: "origin",
        scope: { kind: "dependent-suffix", selectedDeliverableId },
      })),
      execute: vi.fn().mockResolvedValue(refusal),
      write,
      setExitCode: vi.fn(),
    });

    expect(JSON.parse(write.mock.calls[0]?.[0] as string)).toEqual({
      schemaVersion: 1,
      command: "delivery refresh execute",
      ...refusal,
    });
  });

  it("rejects caller-authored refresh member identity and observations", async () => {
    const plan = deliveryStackPlanFixture();
    const execute = vi.fn();
    const write = vi.fn();

    await handleDeliveryExecution("refresh-adopt", { input: "-", json: true }, undefined, {
      readText: vi.fn().mockResolvedValue(JSON.stringify({
        planId: plan.planId,
        repository: "owner/repo",
        remote: "origin",
        affectedDeliverableIds: plan.members.slice(0, -1).map(({ deliverableId }) => deliverableId),
        observation: { target: null, members: [] },
      })),
      execute,
      write,
      setExitCode: vi.fn(),
    });

    expect(execute).not.toHaveBeenCalled();
    expect(JSON.parse(write.mock.calls[0]?.[0] as string)).toMatchObject({
      command: "delivery refresh adopt",
      status: "refused",
      reason: "invalid-command-input",
    });
  });

  it("preserves the native none-landed retry envelope", async () => {
    const recommendedActionText = "Return to prepare and obtain a new interlock before retrying.";
    const write = vi.fn();
    const setExitCode = vi.fn();

    await handleDeliveryExecution("native-land-status", { input: "-", json: true }, undefined, {
      readText: vi.fn().mockResolvedValue(JSON.stringify({
        planId: "123e4567-e89b-42d3-a456-426614174000",
        request: {
          repository: "owner/repo",
          topChangeRequestId: "42",
          topHeadSha: "a".repeat(40),
          mergeAction: "direct_merge",
          mergeMethod: "merge",
        },
        remote: "origin",
      })),
      execute: vi.fn().mockResolvedValue({ status: "retryable", recommendedActionText }),
      write,
      setExitCode,
    });

    expect(JSON.parse(write.mock.calls[0]?.[0] as string)).toEqual({
      schemaVersion: 1,
      command: "delivery native land-status",
      status: "retryable",
      recommendedActionText,
    });
    expect(setExitCode).not.toHaveBeenCalled();
  });

  it("carries the decline route to the verb that clears an unapplied native effect", async () => {
    const planId = "123e4567-e89b-42d3-a456-426614174000";
    const result = {
      status: "retryable" as const,
      transition: "preserved" as const,
      action: "delivery-native-land-status" as const,
      selector: {
        planId,
        operationKind: "land" as const,
        operationId: "operation-1",
        affectedDeliverableIds: [`sha256:${"a".repeat(64)}`],
        mode: "native" as const,
      },
      recommendedActionText: "Rerun `arc delivery native land-status` for the exact native landing subject.",
    };
    const write = vi.fn();

    await handleDeliveryExecution("native-land-release", { input: "-", json: true }, undefined, {
      readText: vi.fn().mockResolvedValue(JSON.stringify({
        planId, repository: "owner/repo", remote: "origin", operationId: "operation-1",
      })),
      execute: vi.fn().mockResolvedValue(result),
      write,
      setExitCode: vi.fn(),
    });

    expect(JSON.parse(write.mock.calls[0]?.[0] as string)).toEqual({
      schemaVersion: 1,
      command: "delivery native land-release",
      ...result,
    });
  });

  it("refuses a decline request that names no reservation to abandon", async () => {
    const write = vi.fn();
    const execute = vi.fn();

    await handleDeliveryExecution("native-land-release", { input: "-", json: true }, undefined, {
      readText: vi.fn().mockResolvedValue(JSON.stringify({
        planId: "123e4567-e89b-42d3-a456-426614174000", repository: "owner/repo", remote: "origin",
      })),
      execute,
      write,
      setExitCode: vi.fn(),
    });

    expect(execute).not.toHaveBeenCalled();
    expect(JSON.parse(write.mock.calls[0]?.[0] as string)).toMatchObject({
      command: "delivery native land-release",
      status: "refused",
      reason: "invalid-command-input",
    });
  });

  it("preserves the released decline, its restorations, and the landing it left standing", async () => {
    const plan = deliveryThreeMemberStackPlanFixture();
    const state = deliveryStateFixture(plan);
    const result = {
      status: "released" as const,
      state: { revision: 5, value: state },
      restorations: [
        { ref: "refs/heads/member-2", observedHead: "a".repeat(40), restoreHead: "5".repeat(40) },
      ],
      landed: {
        effect: {
          providerId: "github",
          repository: "owner/repo",
          changeRequestId: "41",
          headSha: "b".repeat(40),
          baseRef: "delivery-target",
          targetRef: "refs/heads/delivery-target",
          strategy: "merge" as const,
          mergePolicy: {
            repository: "owner/repo",
            stackPosition: "intermediate" as const,
            method: "merge" as const,
            allowedMethods: ["merge"],
            policyFingerprint: `sha256:${"a".repeat(64)}`,
          },
        },
        affectedDeliverableIds: [plan.members[0]!.deliverableId],
      },
    };
    const write = vi.fn();

    await handleDeliveryExecution("native-land-release", { input: "-", json: true }, undefined, {
      readText: vi.fn().mockResolvedValue(JSON.stringify({
        planId: plan.planId, repository: "owner/repo", remote: "origin", operationId: "operation-1",
      })),
      execute: vi.fn().mockResolvedValue(result),
      write,
      setExitCode: vi.fn(),
    });

    expect(JSON.parse(write.mock.calls[0]?.[0] as string)).toEqual({
      schemaVersion: 1,
      command: "delivery native land-release",
      ...result,
    });
  });


  it("preserves a prepared native submit action through native status and general reconciliation", async () => {
    const plan = deliveryStackPlanFixture();
    const member = plan.members[0]!;
    const request = {
      repository: "owner/repo",
      topChangeRequestId: "42",
      topHeadSha: "a".repeat(40),
      mergeAction: "direct_merge" as const,
      mergeMethod: "merge" as const,
    };
    const result = {
      status: "prepared" as const,
      transition: "preserved" as const,
      action: "delivery-native-land-submit" as const,
      presentation: {
        operationId: "operation-1",
        members: [{
          deliverableId: member.deliverableId,
          changeRequestId: request.topChangeRequestId,
          headSha: request.topHeadSha,
        }],
        consequence: "Land only the displayed bottom member at its exact head.",
      },
      submitAction: {
        command: "arc delivery native land-submit - --json" as const,
        input: {
          planId: plan.planId,
          operationId: "operation-1",
          request,
          treeRoot: "/repo",
          remote: "origin",
        },
      },
      recommendedActionText: "Present the exact landing consequence and obtain integration approval.",
    };
    const cases = [
      {
        command: "native-land-status" as const,
        commandName: "delivery native land-status",
        input: { planId: plan.planId, request, remote: "origin" },
      },
      {
        command: "reconcile" as const,
        commandName: "delivery reconcile",
        input: { planId: plan.planId, repository: request.repository, remote: "origin" },
      },
    ];

    for (const entry of cases) {
      const write = vi.fn();
      await handleDeliveryExecution(entry.command, { input: "-", json: true }, undefined, {
        readText: vi.fn().mockResolvedValue(JSON.stringify(entry.input)),
        execute: vi.fn().mockResolvedValue(result),
        write,
        setExitCode: vi.fn(),
      });
      expect(JSON.parse(write.mock.calls[0]?.[0] as string)).toEqual({
        schemaVersion: 1,
        command: entry.commandName,
        ...result,
      });
    }
  });

  it("skips the native registration choice below the provider floor", async () => {
    const plan = deliveryStackPlanFixture();
    const fixture = deliveryStateFixture(plan);
    const members = fixture.members.slice(0, -1).map((member, index) => ({
      deliverableId: member.deliverableId,
      changeRequestId: String(41 + index),
      headRef: `member-${index + 1}`,
      headSha: member.coordinates?.head,
      baseRef: index === 0 ? "main" : `member-${index}`,
      headRepository: "owner/repo",
    }));
    const execute = vi.fn().mockResolvedValue({
      status: "unlinked",
      recommendedActionText:
        "Native registration needs at least two non-terminal members; continue through the unlinked executor.",
    });
    let output = "";

    await handleDeliveryExecution("native-link", { input: "-", json: true }, undefined, {
      readText: vi.fn().mockResolvedValue(JSON.stringify({
        planId: plan.planId,
        protectedBaseRef: "refs/heads/main",
        repository: "owner/repo",
        members,
      })),
      execute,
      write: (text) => { output = text; },
      setExitCode: vi.fn(),
    });

    expect(execute).toHaveBeenCalledOnce();
    expect(JSON.parse(output)).toEqual({
      schemaVersion: 1,
      command: "delivery native link",
      status: "unlinked",
      recommendedActionText:
        "Native registration needs at least two non-terminal members; continue through the unlinked executor.",
    });
  });

  it("surfaces native registration consequences before opt-in when the provider floor is met", async () => {
    const plan = deliveryThreeMemberStackPlanFixture();
    const fixture = deliveryStateFixture(plan);
    const members = fixture.members.slice(0, -1).map((member, index) => ({
      deliverableId: member.deliverableId,
      changeRequestId: String(41 + index),
      headRef: `member-${index + 1}`,
      headSha: member.coordinates?.head,
      baseRef: index === 0 ? "main" : `member-${index}`,
      headRepository: "owner/repo",
    }));
    const execute = vi.fn().mockResolvedValue({
      status: "decision-required",
      recommendedOptInText:
        "Opt in for one attended atomic landing decision over the complete remaining non-terminal set and "
        + "reviewer-facing stack UI for that set. Provider refreshes may rewrite registered heads, so review "
        + "applicability must be re-evaluated before exact-head review can carry; the top remains outside that "
        + "UI and native retarget machinery.",
      recommendedOptOutText:
        "Decline for zero native-registration host calls and the complete sequential unlinked executor. This "
        + "avoids provider-initiated rewrites, but strict up-to-date protection may still require head-rewriting "
        + "refreshes on either route.",
      recommendedActionText:
        "Choose native registration or unlinked delivery, then resubmit this exact request with optIn true or false.",
    });
    let output = "";

    await handleDeliveryExecution("native-link", { input: "-", json: true }, undefined, {
      readText: vi.fn().mockResolvedValue(JSON.stringify({
        planId: plan.planId,
        protectedBaseRef: "refs/heads/main",
        repository: "owner/repo",
        members,
      })),
      execute,
      write: (text) => { output = text; },
      setExitCode: vi.fn(),
    });

    expect(execute).toHaveBeenCalledOnce();
    expect(JSON.parse(output)).toEqual({
      schemaVersion: 1,
      command: "delivery native link",
      status: "decision-required",
      recommendedOptInText:
        "Opt in for one attended atomic landing decision over the complete remaining non-terminal set and "
        + "reviewer-facing stack UI for that set. Provider refreshes may rewrite registered heads, so review "
        + "applicability must be re-evaluated before exact-head review can carry; the top remains outside that "
        + "UI and native retarget machinery.",
      recommendedOptOutText:
        "Decline for zero native-registration host calls and the complete sequential unlinked executor. This "
        + "avoids provider-initiated rewrites, but strict up-to-date protection may still require head-rewriting "
        + "refreshes on either route.",
      recommendedActionText:
        "Choose native registration or unlinked delivery, then resubmit this exact request with optIn true or false.",
    });
  });

  it("accepts a plan-bound native registration request", async () => {
    const plan = deliveryStackPlanFixture();
    const fixture = deliveryStateFixture(plan);
    const exactMembers = fixture.members.slice(0, -1).map((member, index) => ({
      deliverableId: member.deliverableId,
      changeRequestId: String(41 + index),
      headRef: `member-${index + 1}`,
      headSha: member.coordinates?.head,
      baseRef: index === 0 ? "main" : `member-${index}`,
      headRepository: "owner/repo",
    }));
    let output = "";

    await handleDeliveryExecution("native-link", { input: "-", json: true }, undefined, {
      readText: vi.fn().mockResolvedValue(JSON.stringify({
        planId: plan.planId,
        protectedBaseRef: "refs/heads/main",
        repository: "owner/repo",
        members: exactMembers,
        optIn: true,
      })),
      execute: async (command, request) => {
        const candidate = request as {
          readonly planId?: unknown;
          readonly protectedBaseRef?: unknown;
          readonly repository?: unknown;
          readonly members?: unknown;
          readonly optIn?: unknown;
        };
        return command === "native-link"
          && candidate.planId === plan.planId
          && candidate.protectedBaseRef === "refs/heads/main"
          && candidate.repository === "owner/repo"
          && JSON.stringify(candidate.members) === JSON.stringify(exactMembers)
          && candidate.optIn === true
          ? {
            status: "unlinked",
            recommendedActionText: "Continue through the complete unlinked executor.",
          }
          : { status: "refused", reason: "unexpected-request" };
      },
      write: (text) => { output = text; },
      setExitCode: vi.fn(),
    });

    expect(JSON.parse(output)).toMatchObject({ status: "unlinked" });
  });

  it("admits an empty planned native subject for a terminal-only delivery", async () => {
    const plan = deliverySingleMemberStackPlanFixture();
    for (const command of ["native-link", "native-unlink"] as const) {
      const execute = vi.fn().mockResolvedValue({
        status: "unlinked",
        recommendedActionText: "Continue ordinary terminal integration.",
      });
      const write = vi.fn();
      const request = command === "native-link"
        ? {
            planId: plan.planId,
            protectedBaseRef: "refs/heads/main",
            repository: "owner/repo",
            members: [],
            optIn: true,
          }
        : { planId: plan.planId, repository: "owner/repo", members: [] };

      await handleDeliveryExecution(command, { input: "-", json: true }, undefined, {
        readText: vi.fn().mockResolvedValue(JSON.stringify(request)),
        execute,
        write,
        setExitCode: vi.fn(),
      });
      expect(execute).toHaveBeenCalledOnce();
      expect(JSON.parse(write.mock.calls[0]?.[0] as string)).toMatchObject({ status: "unlinked" });
    }
  });


  it("accepts locator-only native selection and rejects caller-authored position data", async () => {
    const plan = deliveryStackPlanFixture();
    const state = deliveryStateFixture(plan);
    const request = {
      planId: plan.planId,
      repository: "owner/repo",
      remote: "origin",
      mergeAction: "direct",
      explicitAtomic: false,
    };
    const execute = vi.fn().mockResolvedValue({
      status: "blocked",
      reason: "unsupported",
      recommendedActionText: "Use the complete unlinked landing route.",
    });
    const acceptedWrite = vi.fn();

    await handleDeliveryExecution("native-land-select", { input: "-", json: true }, undefined, {
      readText: vi.fn().mockResolvedValue(JSON.stringify(request)),
      execute,
      write: acceptedWrite,
      setExitCode: vi.fn(),
    });
    expect(execute).toHaveBeenCalledOnce();
    expect(JSON.parse(acceptedWrite.mock.calls[0]?.[0] as string)).toMatchObject({
      status: "blocked",
      reason: "unsupported",
    });

    const rejectedExecute = vi.fn();
    const rejectedWrite = vi.fn();
    await handleDeliveryExecution("native-land-select", { input: "-", json: true }, undefined, {
      readText: vi.fn().mockResolvedValue(JSON.stringify({ ...request, members: state.members.slice(0, -1) })),
      execute: rejectedExecute,
      write: rejectedWrite,
      setExitCode: vi.fn(),
    });
    expect(rejectedExecute).not.toHaveBeenCalled();
    expect(JSON.parse(rejectedWrite.mock.calls[0]?.[0] as string)).toMatchObject({
      status: "refused",
      reason: "invalid-command-input",
    });

    const rejectedFactsExecute = vi.fn();
    const rejectedFactsWrite = vi.fn();
    await handleDeliveryExecution("native-land-select", { input: "-", json: true }, undefined, {
      readText: vi.fn().mockResolvedValue(JSON.stringify({
        ...request,
        facts: {
          target: state.target,
          members: state.members,
          landedDeliverableIds: [],
        },
      })),
      execute: rejectedFactsExecute,
      write: rejectedFactsWrite,
      setExitCode: vi.fn(),
    });
    expect(rejectedFactsExecute).not.toHaveBeenCalled();
    expect(JSON.parse(rejectedFactsWrite.mock.calls[0]?.[0] as string)).toMatchObject({
      status: "refused",
      reason: "invalid-command-input",
    });
  });

  it("accepts only a short protected base at the native landing preparation boundary", async () => {
    const plan = deliveryStackPlanFixture();
    const member = deliveryStateFixture(plan).members[0]!;
    const request = {
      planId: plan.planId,
      operationId: "native-operation",
      selection: {
        status: "selected",
        arm: "linked-single",
        members: [{
          deliverableId: member.deliverableId,
          changeRequestId: "41",
          headSha: member.coordinates!.head,
        }],
        recommendedActionText: "Prepare the selected native effect.",
      },
      repository: "owner/repo",
      remote: "origin",
      baseRef: "main",
      targetRef: "refs/heads/main",
      treeRoot: ".",
    } as const;
    const execute = vi.fn().mockResolvedValue({ status: "blocked", reason: "fixture" });
    const acceptedWrite = vi.fn();

    await handleDeliveryExecution("native-land-prepare", { input: "-", json: true }, undefined, {
      readText: vi.fn().mockResolvedValue(JSON.stringify(request)),
      execute,
      write: acceptedWrite,
      setExitCode: vi.fn(),
    });
    expect(execute).toHaveBeenCalledOnce();

    const rejectedExecute = vi.fn();
    const rejectedWrite = vi.fn();
    await handleDeliveryExecution("native-land-prepare", { input: "-", json: true }, undefined, {
      readText: vi.fn().mockResolvedValue(JSON.stringify({ ...request, baseRef: "refs/heads/main" })),
      execute: rejectedExecute,
      write: rejectedWrite,
      setExitCode: vi.fn(),
    });
    expect(rejectedExecute).not.toHaveBeenCalled();
    expect(JSON.parse(rejectedWrite.mock.calls[0]?.[0] as string)).toMatchObject({
      status: "refused",
      reason: "invalid-command-input",
    });
  });


  it("exposes the explicit terminal remedy as a strict typed command", async () => {
    const state = deliveryStateFixture();
    const terminal = state.members.at(-1)!;
    const bound = {
      ...state,
      members: state.members.map((member, index) => ({
        ...member,
        changeRequest: { providerId: "github", changeRequestId: String(401 + index) },
      })),
    };
    const execute = vi.fn().mockResolvedValue({
      status: "remedied",
      state: { revision: 9, value: bound },
      nextAction: "terminal-checkpoint",
      top: {
        status: "ready",
        request: {
          binding: { providerId: "github", changeRequestId: "402" },
          repository: "owner/repo",
          headRef: terminal.ref!.replace("refs/heads/", ""),
          headSha: terminal.coordinates!.head,
          baseRef: "main",
          state: "open",
        },
      },
    });
    const write = vi.fn();
    await handleDeliveryExecution("top-remedy", { input: "-", json: true }, undefined, {
      readText: vi.fn().mockResolvedValue(JSON.stringify({
        planId: state.planId,
        action: "retarget",
        repository: "owner/repo",
        protectedBaseRef: "main",
      })),
      execute,
      write,
      setExitCode: vi.fn(),
    });
    expect(execute).toHaveBeenCalledWith("top-remedy", {
      planId: state.planId,
      action: "retarget",
      repository: "owner/repo",
      protectedBaseRef: "main",
      remote: "origin",
    }, undefined);
    expect(JSON.parse(write.mock.calls[0]?.[0] as string)).toMatchObject({
      command: "delivery top-remedy",
      status: "remedied",
      nextAction: "terminal-checkpoint",
    });
  });

  it("rejects a closed eligibility snapshot as materialization authority", async () => {
    const plan = deliveryStackPlanFixture();
    const execute = vi.fn().mockResolvedValue({ status: "materialized" });
    const write = vi.fn();

    await handleDeliveryExecution("publish", { input: "-", json: true }, undefined, {
      readText: vi.fn().mockResolvedValue(JSON.stringify({
        plan,
        snapshot: {
          planId: plan.planId,
          workUnitId: plan.workUnitId,
          planRevision: plan.planRevision,
          planDigest: plan.planDigest,
          protectedBase: { ref: "refs/heads/main", head: "1".repeat(40), tree: "2".repeat(40) },
          top: { ref: "refs/heads/control", head: "3".repeat(40), tree: "4".repeat(40) },
          members: plan.members.map((member, index) => ({
            deliverableId: member.deliverableId,
            ref: `refs/heads/candidate-${index + 1}`,
            head: String(index + 5).repeat(40),
            tree: String(index + 7).repeat(40),
          })),
          lifecyclePaths: [".arc/active/meta-delivery-plan-record.md"],
        },
        remote: "origin",
      })),
      execute,
      write,
      setExitCode: vi.fn(),
    });

    expect(JSON.parse(write.mock.calls[0]?.[0] as string)).toMatchObject({
      command: "delivery publish",
      status: "refused",
      reason: "invalid-command-input",
    });
    expect(execute).not.toHaveBeenCalled();
  });

  it("accepts only raw candidate refs and checkout locators for mutation", async () => {
    const plan = deliveryStackPlanFixture();
    const write = vi.fn();

    await handleDeliveryExecution("publish", { input: "-", json: true }, undefined, {
      readText: vi.fn().mockResolvedValue(JSON.stringify({
        planId: plan.planId,
        protectedBaseRef: "refs/heads/main",
        topRef: "refs/heads/control",
        candidates: plan.members.map((member, index) => ({
          deliverableId: member.deliverableId,
          ref: `refs/heads/candidate-${index + 1}`,
          checkoutPath: `/tmp/candidate-${index + 1}`,
        })),
        remote: "origin",
        ...publicationFields(plan),
      })),
      execute: vi.fn().mockResolvedValue({ status: "refused", reason: "checkout-moved" }),
      write,
      setExitCode: vi.fn(),
    });

    expect(JSON.parse(write.mock.calls[0]?.[0] as string)).toMatchObject({
      command: "delivery publish",
      status: "refused",
      reason: "checkout-moved",
    });
  });

  it("requires complete non-terminal and ordinary terminal presentations before publication", async () => {
    const plan = deliveryStackPlanFixture();
    const baseRequest = {
      planId: plan.planId,
      protectedBaseRef: "refs/heads/main",
      topRef: "refs/heads/control",
      candidates: plan.members.map((member, index) => ({
        deliverableId: member.deliverableId,
        ref: `refs/heads/candidate-${index + 1}`,
        checkoutPath: `/tmp/candidate-${index + 1}`,
      })),
      gateResults: publicationFields(plan).gateResults,
      repository: "andrewRCr/arc-framework",
      draft: true,
      remote: "origin",
      presentations: plan.members.slice(0, -1).map((member) => ({
        deliverableId: member.deliverableId,
        summary: `Review ${member.title}.`,
        changes: [{ topic: "Boundary", description: "Adds the concrete reviewer-facing change." }],
      })),
    };
    const rejected = vi.fn();
    const rejectedWrite = vi.fn();
    await handleDeliveryExecution("publish", { input: "-", json: true }, undefined, {
      readText: vi.fn().mockResolvedValue(JSON.stringify(baseRequest)),
      execute: rejected,
      write: rejectedWrite,
      setExitCode: vi.fn(),
    });
    expect(rejected).not.toHaveBeenCalled();
    expect(JSON.parse(rejectedWrite.mock.calls[0]?.[0] as string)).toMatchObject({
      status: "refused",
      reason: "invalid-command-input",
    });

    const accepted = vi.fn().mockResolvedValue({ status: "refused", reason: "checkout-moved" });
    await handleDeliveryExecution("publish", { input: "-", json: true }, undefined, {
      readText: vi.fn().mockResolvedValue(JSON.stringify({
        ...baseRequest,
        terminalPresentation: {
          title: "feat(delivery): publish the work unit",
          body: "## Summary\n\nPublish the complete work unit.",
        },
      })),
      execute: accepted,
      write: vi.fn(),
      setExitCode: vi.fn(),
    });
    expect(accepted).toHaveBeenCalledOnce();
  });

  it("rejects caller-authored reconciliation evidence", async () => {
    const execute = vi.fn();
    const write = vi.fn();
    await handleDeliveryExecution("reconcile", { input: "-", json: true }, undefined, {
      readText: vi.fn().mockResolvedValue(JSON.stringify({
        planId: "123e4567-e89b-42d3-a456-426614174000",
        observation: { outcome: "applied" },
      })),
      execute,
      write,
      setExitCode: vi.fn(),
    });
    expect(execute).not.toHaveBeenCalled();
    expect(JSON.parse(write.mock.calls[0]?.[0] as string)).toMatchObject({
      status: "refused",
      reason: "invalid-command-input",
    });
  });

  it("rejects caller-authored settled record-effect authority", async () => {
    const state = deliveryStateFixture(deliveryStackPlanFixture());
    const execute = vi.fn();
    const write = vi.fn();

    await handleDeliveryExecution("reconcile", { input: "-", json: true }, undefined, {
      readText: vi.fn().mockResolvedValue(JSON.stringify({
        planId: state.planId,
        repository: "owner/repo",
        settledRecordEffectHead: "d".repeat(40),
      })),
      execute,
      write,
      setExitCode: vi.fn(),
    });

    expect(execute).not.toHaveBeenCalled();
    expect(JSON.parse(write.mock.calls[0]?.[0] as string)).toMatchObject({
      status: "refused",
      reason: "invalid-command-input",
    });
  });

  it("preserves the terminal-coordinate rebind and checkpoint rerun envelope", async () => {
    const state = deliveryStateFixture(deliveryStackPlanFixture());
    const terminalHead = "a".repeat(40);
    const rebound = {
      ...state,
      members: state.members.map((member, index, members) => index === members.length - 1
        ? {
            ...member,
            coordinates: { base: "b".repeat(40), head: terminalHead, tree: "c".repeat(40) },
          }
        : member),
    };
    const write = vi.fn();

    await handleDeliveryExecution("reconcile", { input: "-", json: true }, undefined, {
      readText: vi.fn().mockResolvedValue(JSON.stringify({
        planId: state.planId,
        repository: "owner/repo",
      })),
      execute: vi.fn().mockResolvedValue({
        status: "rebound",
        state: { revision: 9, value: rebound },
        nextAction: "rerun-checkpoint",
      }),
      write,
      setExitCode: vi.fn(),
    });

    expect(JSON.parse(write.mock.calls[0]?.[0] as string)).toEqual({
      schemaVersion: 1,
      command: "delivery reconcile",
      status: "rebound",
      state: { revision: 9, value: rebound },
      nextAction: "rerun-checkpoint",
    });
  });

  it("preserves the applied sequential-land teardown continuation", async () => {
    const plan = deliveryStackPlanFixture();
    const state = deliveryStateFixture(plan);
    const selectedDeliverableId = plan.members[0]!.deliverableId;
    const result = {
      status: "applied" as const,
      state: { revision: 9, value: state },
      nextAction: "teardown-member" as const,
      selectedDeliverableId,
    };
    const write = vi.fn();

    await handleDeliveryExecution("reconcile", { input: "-", json: true }, undefined, {
      readText: vi.fn().mockResolvedValue(JSON.stringify({
        planId: plan.planId,
        repository: "owner/repo",
        remote: "origin",
      })),
      execute: vi.fn().mockResolvedValue(result),
      write,
      setExitCode: vi.fn(),
    });

    expect(JSON.parse(write.mock.calls[0]?.[0] as string)).toEqual({
      schemaVersion: 1,
      command: "delivery reconcile",
      ...result,
    });
  });

  it("serializes every recovery action-selector arm and rejects malformed pairings", async () => {
    const plan = deliveryStackPlanFixture();
    const affectedDeliverableIds = [plan.members[0]!.deliverableId];
    const request = JSON.stringify({
      planId: plan.planId,
      repository: "andrewRCr/arc-framework",
      remote: "origin",
    });
    const cases = [
      { operationKind: "materialize", transition: "cleared", action: "delivery-publish" },
      { operationKind: "publish", transition: "preserved", action: "delivery-publish" },
      {
        operationKind: "rewrite", mode: "review-fix", transition: "cleared",
        action: "delivery-rematerialize",
      },
      {
        operationKind: "rewrite", mode: "selected-change", transition: "cleared",
        action: "delivery-review-fix-publish",
      },
      {
        operationKind: "rewrite", mode: "provider-adoption", transition: "preserved",
        action: "delivery-refresh-adopt",
      },
      {
        operationKind: "rewrite", mode: "provider-refresh", transition: "preserved",
        action: "delivery-refresh-execute",
      },
      { operationKind: "land", mode: "sequential", transition: "cleared", action: "delivery-land-prepare" },
      {
        operationKind: "land", mode: "native", transition: "cleared",
        action: "delivery-native-land-select",
      },
      {
        operationKind: "land", mode: "sequential", transition: "cleared",
        action: "delivery-native-land-select",
      },
      { operationKind: "teardown", transition: "preserved", action: "delivery-teardown" },
      { operationKind: "top-remedy", transition: "cleared", action: "delivery-top-remedy" },
    ] as const;
    for (const [index, entry] of cases.entries()) {
      const result = {
        status: "retryable" as const,
        transition: entry.transition,
        action: entry.action,
        selector: {
          planId: plan.planId,
          operationKind: entry.operationKind,
          operationId: `operation-${index + 1}`,
          affectedDeliverableIds,
          ...(entry.operationKind === "rewrite" || entry.operationKind === "land"
            ? { mode: entry.mode }
            : {}),
        },
        recommendedActionText: `Rerun the exact ${entry.action} action.`,
      };
      const write = vi.fn();
      await handleDeliveryExecution("reconcile", { input: "-", json: true }, undefined, {
        readText: vi.fn().mockResolvedValue(request),
        execute: vi.fn().mockResolvedValue(result),
        write,
        setExitCode: vi.fn(),
      });
      expect(JSON.parse(write.mock.calls[0]?.[0] as string)).toEqual({
        schemaVersion: 1,
        command: "delivery reconcile",
        ...result,
      });
    }

    const write = vi.fn();
    await handleDeliveryExecution("reconcile", { input: "-", json: true }, undefined, {
      readText: vi.fn().mockResolvedValue(request),
      execute: vi.fn().mockResolvedValue({
        status: "retryable",
        transition: "preserved",
        action: "delivery-teardown",
        selector: {
          planId: plan.planId,
          operationKind: "materialize",
          operationId: "operation-invalid",
          affectedDeliverableIds,
        },
        recommendedActionText: "This action and selector do not match.",
      }),
      write,
      setExitCode: vi.fn(),
    });
    expect(JSON.parse(write.mock.calls[0]?.[0] as string)).toMatchObject({
      status: "refused",
      reason: "invalid-service-result",
    });
  });

  it("preserves contribution refusal evidence through the strict result envelope", async () => {
    const request = JSON.stringify({
      planId: "123e4567-e89b-42d3-a456-426614174000",
      repository: "andrewRCr/arc-framework",
      remote: "origin",
    });
    const blockedWrite = vi.fn();
    await handleDeliveryExecution("reconcile", { input: "-", json: true }, undefined, {
      readText: vi.fn().mockResolvedValue(request),
      execute: vi.fn().mockResolvedValue({
        status: "blocked",
        reason: "contribution-conflicted",
        paths: ["shared.txt"],
        guidance: "Resolve the conflicted contribution before retrying.",
      }),
      write: blockedWrite,
      setExitCode: vi.fn(),
    });
    expect(JSON.parse(blockedWrite.mock.calls[0]?.[0] as string)).toMatchObject({
      status: "blocked",
      reason: "contribution-conflicted",
      paths: ["shared.txt"],
    });

    const refusedWrite = vi.fn();
    await handleDeliveryExecution("reconcile", { input: "-", json: true }, undefined, {
      readText: vi.fn().mockResolvedValue(request),
      execute: vi.fn().mockResolvedValue({
        status: "refused",
        reason: "contribution-diverged",
        paths: ["feature.txt"],
      }),
      write: refusedWrite,
      setExitCode: vi.fn(),
    });
    expect(JSON.parse(refusedWrite.mock.calls[0]?.[0] as string)).toMatchObject({
      status: "refused",
      reason: "contribution-diverged",
      paths: ["feature.txt"],
    });
  });

  it("preserves lifecycle-contribution refusal evidence through the strict result envelope", async () => {
    const plan = deliveryStackPlanFixture();
    const deliverableId = plan.members[0]!.deliverableId;
    const paths = [
      ".arc/backlog/planned/example/draft-example.md",
      ".arc/backlog/planned/example/meta-example.md",
    ];
    const write = vi.fn();
    const setExitCode = vi.fn();

    await handleDeliveryExecution("publish", { input: "-", json: true }, undefined, {
      readText: vi.fn().mockResolvedValue(JSON.stringify({
        planId: plan.planId,
        protectedBaseRef: "refs/heads/main",
        topRef: "refs/heads/feat/example",
        candidates: plan.members.map((member, index) => ({
          deliverableId: member.deliverableId,
          ref: `refs/heads/candidate-${index + 1}`,
          checkoutPath: `/tmp/candidate-${index + 1}`,
        })),
        remote: "origin",
        ...publicationFields(plan),
      })),
      execute: vi.fn().mockResolvedValue({
        status: "refused",
        reason: "lifecycle-contribution",
        deliverableId,
        paths,
      }),
      write,
      setExitCode,
    });

    expect(JSON.parse(write.mock.calls[0]?.[0] as string)).toMatchObject({
      schemaVersion: 1,
      command: "delivery publish",
      status: "refused",
      reason: "lifecycle-contribution",
      deliverableId,
      paths,
      detail: "The delivery publish operation stopped because lifecycle-contribution.",
      coordinates: { planId: plan.planId, deliverableId },
      continuation: { kind: "terminal-explanation" },
    });
    expect(setExitCode).toHaveBeenCalledWith(1);
  });

  it("preserves chain-containment refusal paths through the strict result envelope", async () => {
    const plan = deliveryStackPlanFixture();
    const request = JSON.stringify({
      planId: plan.planId,
      protectedBaseRef: "refs/heads/main",
      topRef: "refs/heads/feat/example",
      candidates: plan.members.map((member, index) => ({
        deliverableId: member.deliverableId,
        ref: `refs/heads/candidate-${index + 1}`,
        checkoutPath: `/tmp/candidate-${index + 1}`,
      })),
      remote: "origin",
      ...publicationFields(plan),
    });
    const write = vi.fn();

    await handleDeliveryExecution("publish", { input: "-", json: true }, undefined, {
      readText: vi.fn().mockResolvedValue(request),
      execute: vi.fn().mockResolvedValue({
        status: "refused",
        reason: "containment-diverged",
        paths: ["feature.txt"],
      }),
      write,
      setExitCode: vi.fn(),
    });

    expect(JSON.parse(write.mock.calls[0]?.[0] as string)).toMatchObject({
      status: "refused",
      reason: "containment-diverged",
      paths: ["feature.txt"],
    });
  });

  it("accepts rematerialization without caller-authored suffix locators", async () => {
    const plan = deliveryStackPlanFixture();
    const execute = vi.fn().mockResolvedValue({ status: "refused", reason: "candidate-moved" });
    const write = vi.fn();
    await handleDeliveryExecution("rematerialize", { input: "-", json: true }, undefined, {
      readText: vi.fn().mockResolvedValue(JSON.stringify({
        planId: plan.planId,
        protectedBaseRef: "refs/heads/main",
        topRef: "refs/heads/control",
        selectedDeliverableIds: [plan.members[0]!.deliverableId],
        repository: "andrewRCr/arc-framework",
        remote: "origin",
      })),
      execute,
      write,
      setExitCode: vi.fn(),
    });
    expect(execute).toHaveBeenCalledOnce();
    expect(JSON.parse(write.mock.calls[0]?.[0] as string)).toMatchObject({
      status: "refused",
      reason: "candidate-moved",
    });
  });

  it("preserves an exact full-rematerialization eligibility refusal", async () => {
    const plan = deliveryStackPlanFixture();
    const write = vi.fn();
    await handleDeliveryExecution("rematerialize", { input: "-", json: true }, undefined, {
      readText: vi.fn().mockResolvedValue(JSON.stringify({
        planId: plan.planId,
        protectedBaseRef: "refs/heads/main",
        topRef: "refs/heads/feat/example",
        selectedDeliverableIds: [plan.members[0]!.deliverableId],
        repository: "andrewRCr/arc-framework",
        remote: "origin",
      })),
      execute: vi.fn().mockResolvedValue({
        status: "refused",
        reason: "completeness-mismatched",
      }),
      write,
      setExitCode: vi.fn(),
    });
    expect(JSON.parse(write.mock.calls[0]?.[0] as string)).toMatchObject({
      command: "delivery rematerialize",
      status: "refused",
      reason: "completeness-mismatched",
    });
  });

  it("returns the typed after-fix verification route from rematerialization", async () => {
    const plan = deliveryStackPlanFixture();
    const state = deliveryStateFixture(plan);
    const changed = plan.members[0]!.deliverableId;
    const terminal = state.members.at(-1)!.coordinates!;
    const pendingState = {
      ...state,
      pendingReviewFixVerification: {
        selectedDeliverableId: changed,
        memberDeliverableIds: [changed],
      },
    };
    const execute = vi.fn().mockResolvedValue({
      status: "rematerialized",
      state: { revision: 8, value: pendingState },
      selectedDeliverableId: changed,
      contributionVerdicts: [{ deliverableId: changed, contribution: "changed", proof: "selected-change" }],
      nextAction: "verify-review-fix",
      verification: {
        memberDeliverableIds: [changed],
        tier1Required: true,
        target: { head: terminal.head, tree: terminal.tree },
        tier1Reuse: {
          kind: "exact-tree",
          targetTree: terminal.tree,
          requiredResult: "passed",
          coveredInputs: "unchanged",
        },
      },
      acknowledgementInput: {
        planId: plan.planId,
        selectedDeliverableId: changed,
        memberDeliverableIds: [changed],
        expectedStateRevision: 8,
        continuationDigest: `sha256:${"f".repeat(64)}`,
      },
    });
    const write = vi.fn();
    await handleDeliveryExecution("rematerialize", { input: "-", json: true }, undefined, {
      readText: vi.fn().mockResolvedValue(JSON.stringify({
        planId: plan.planId,
        protectedBaseRef: "refs/heads/main",
        topRef: "refs/heads/control",
        selectedDeliverableIds: [changed],
        repository: "andrewRCr/arc-framework",
        remote: "origin",
      })),
      execute,
      write,
      setExitCode: vi.fn(),
    });
    expect(JSON.parse(write.mock.calls[0]?.[0] as string)).toMatchObject({
      status: "rematerialized",
      nextAction: "verify-review-fix",
      verification: {
        memberDeliverableIds: [changed],
        tier1Required: true,
        target: { head: terminal.head, tree: terminal.tree },
        tier1Reuse: {
          kind: "exact-tree",
          targetTree: terminal.tree,
          requiredResult: "passed",
          coveredInputs: "unchanged",
        },
      },
      acknowledgementInput: {
        selectedDeliverableId: changed,
        expectedStateRevision: 8,
      },
    });
  });

  it("passes a native suffix disclosure through the result union without ref restorations", async () => {
    const plan = deliveryFourMemberStackPlanFixture();
    const conflicts = [
      { deliverableId: plan.members[1]!.deliverableId, paths: ["src/second.ts"] },
      { deliverableId: plan.members[2]!.deliverableId, paths: ["src/third.ts"] },
    ];
    const result = {
      status: "conflict-resolution-required" as const,
      conflicts,
      resolutionInput: {
        planId: plan.planId,
        scope: { kind: "native-suffix" as const, operationId: "operation-1" },
        expectedStateRevision: 2,
        observedSuffixDigest: `sha256:${"b".repeat(64)}`,
        conflicts,
      },
      recommendedActionText: "Resolve the listed member paths, then resubmit this resolution.",
    };
    const write = vi.fn();

    await handleDeliveryExecution("native-land-status", { input: "-", json: true }, undefined, {
      readText: vi.fn().mockResolvedValue(JSON.stringify({
        planId: plan.planId,
        request: {
          repository: "owner/repo", topChangeRequestId: "42", topHeadSha: "a".repeat(40),
          mergeAction: "direct_merge", mergeMethod: "merge",
        },
        remote: "origin",
      })),
      execute: vi.fn().mockResolvedValue(result),
      write,
      setExitCode: vi.fn(),
    });

    const envelope = JSON.parse(write.mock.calls[0]?.[0] as string) as Record<string, unknown>;
    expect(envelope).toEqual({ schemaVersion: 1, command: "delivery native land-status", ...result });
    expect(envelope).not.toHaveProperty("externalRefRestorations");
  });

  it("admits the native conflict scope only on a resubmitted resolution", async () => {
    const plan = deliveryFourMemberStackPlanFixture();
    const nativeScope = { kind: "native-suffix", operationId: "operation-1" };

    const planWrite = vi.fn();
    const planExecute = vi.fn();
    await handleDeliveryExecution("refresh-plan", { input: "-", json: true }, undefined, {
      readText: vi.fn().mockResolvedValue(JSON.stringify({
        planId: plan.planId, repository: "owner/repo", trigger: { kind: "operator-choice" },
        scope: nativeScope, remote: "origin",
      })),
      execute: planExecute,
      write: planWrite,
      setExitCode: vi.fn(),
    });
    expect(planExecute).not.toHaveBeenCalled();
    expect(JSON.parse(planWrite.mock.calls[0]?.[0] as string)).toMatchObject({
      status: "refused",
      reason: "invalid-command-input",
    });

    const adoptExecute = vi.fn().mockResolvedValue({ status: "retryable", recommendedActionText: "Retry." });
    await handleDeliveryExecution("refresh-adopt", { input: "-", json: true }, undefined, {
      readText: vi.fn().mockResolvedValue(JSON.stringify({
        planId: plan.planId, repository: "owner/repo", remote: "origin",
        conflictResolution: {
          planId: plan.planId,
          scope: nativeScope,
          expectedStateRevision: 2,
          observedSuffixDigest: `sha256:${"b".repeat(64)}`,
          conflicts: [{ deliverableId: plan.members[1]!.deliverableId, paths: ["src/second.ts"] }],
        },
      })),
      execute: adoptExecute,
      write: vi.fn(),
      setExitCode: vi.fn(),
    });
    expect(adoptExecute).toHaveBeenCalledOnce();
  });

  it("carries a resubmitted native resolution to the settle path", async () => {
    const plan = deliveryFourMemberStackPlanFixture();
    const conflicts = [{ deliverableId: plan.members[1]!.deliverableId, paths: ["src/second.ts"] }];
    const result = {
      status: "conflict-resolution-required" as const,
      conflicts,
      resolutionInput: {
        planId: plan.planId,
        scope: { kind: "native-suffix" as const, operationId: "operation-1" },
        expectedStateRevision: 2,
        observedSuffixDigest: `sha256:${"b".repeat(64)}`,
        conflicts,
      },
      recommendedActionText: "Resolve the listed member paths, then resubmit this resolution.",
    };
    const write = vi.fn();

    await handleDeliveryExecution("native-land-status", { input: "-", json: true }, undefined, {
      readText: vi.fn().mockResolvedValue(JSON.stringify({
        planId: plan.planId,
        request: {
          repository: "owner/repo", topChangeRequestId: "42", topHeadSha: "a".repeat(40),
          mergeAction: "direct_merge", mergeMethod: "merge",
        },
        remote: "origin",
        conflictResolution: result.resolutionInput,
      })),
      execute: vi.fn().mockResolvedValue(result),
      write,
      setExitCode: vi.fn(),
    });

    expect(JSON.parse(write.mock.calls[0]?.[0] as string)).toEqual({
      schemaVersion: 1, command: "delivery native land-status", ...result,
    });
  });

  it("refuses a dependent-scoped resolution on the native status request", async () => {
    const plan = deliveryFourMemberStackPlanFixture();
    const write = vi.fn();
    const settled = { status: "applied" as const, state: { revision: 3, value: deliveryStateFixture() } };

    await handleDeliveryExecution("native-land-status", { input: "-", json: true }, undefined, {
      readText: vi.fn().mockResolvedValue(JSON.stringify({
        planId: plan.planId,
        request: {
          repository: "owner/repo", topChangeRequestId: "42", topHeadSha: "a".repeat(40),
          mergeAction: "direct_merge", mergeMethod: "merge",
        },
        remote: "origin",
        conflictResolution: {
          planId: plan.planId,
          scope: { kind: "dependent-suffix", selectedDeliverableId: plan.members[1]!.deliverableId },
          expectedStateRevision: 2,
          observedSuffixDigest: `sha256:${"b".repeat(64)}`,
          conflicts: [{ deliverableId: plan.members[1]!.deliverableId, paths: ["src/second.ts"] }],
        },
      })),
      execute: vi.fn().mockResolvedValue(settled),
      write,
      setExitCode: vi.fn(),
    });

    expect(JSON.parse(write.mock.calls[0]?.[0] as string)).toMatchObject({
      status: "refused",
      reason: "invalid-command-input",
    });
  });

  const nativeStatusRequest = (planId: string) => JSON.stringify({
    planId,
    request: {
      repository: "owner/repo", topChangeRequestId: "42", topHeadSha: "a".repeat(40),
      mergeAction: "direct_merge", mergeMethod: "merge",
    },
    remote: "origin",
  });

  const terminalConflictRefusal = {
    status: "blocked" as const,
    reason: "contribution-conflicted" as const,
    paths: ["docs/top.md"],
    guidance: "Merge the highest member into the checked-out terminal top by hand.",
  };

  it("carries the terminal conflict disclosure through the native status envelope", async () => {
    const plan = deliveryFourMemberStackPlanFixture();
    const result = {
      ...terminalConflictRefusal,
      conflictPreparation: {
        topRef: "refs/heads/member-4",
        logicalMergeBase: "6".repeat(40),
        parents: { top: "7".repeat(40), refreshedPredecessor: "c".repeat(40) },
        mergeTree: {
          argv: [
            "git", "merge-tree", "--write-tree", "--merge-base", "6".repeat(40),
            "--name-only", "-z", "--no-messages", "7".repeat(40), "c".repeat(40),
          ],
        },
      },
    };
    const write = vi.fn();

    await handleDeliveryExecution("native-land-status", { input: "-", json: true }, undefined, {
      readText: vi.fn().mockResolvedValue(nativeStatusRequest(plan.planId)),
      execute: vi.fn().mockResolvedValue(result),
      write,
      setExitCode: vi.fn(),
    });

    expect(JSON.parse(write.mock.calls[0]?.[0] as string)).toEqual({
      schemaVersion: 1, command: "delivery native land-status", ...result,
    });
  });

  it("carries the restorations for refs moved before the terminal conflict", async () => {
    const plan = deliveryFourMemberStackPlanFixture();
    const result = {
      ...terminalConflictRefusal,
      externalRefRestorations: [
        { ref: "refs/heads/member-2", observedHead: "a".repeat(40), restoreHead: "5".repeat(40) },
      ],
    };
    const write = vi.fn();

    await handleDeliveryExecution("native-land-status", { input: "-", json: true }, undefined, {
      readText: vi.fn().mockResolvedValue(nativeStatusRequest(plan.planId)),
      execute: vi.fn().mockResolvedValue(result),
      write,
      setExitCode: vi.fn(),
    });

    expect(JSON.parse(write.mock.calls[0]?.[0] as string)).toEqual({
      schemaVersion: 1, command: "delivery native land-status", ...result,
    });
  });

  it("carries a terminal conflict refusal that discloses neither preparation nor restorations", async () => {
    const plan = deliveryFourMemberStackPlanFixture();
    const write = vi.fn();

    await handleDeliveryExecution("native-land-status", { input: "-", json: true }, undefined, {
      readText: vi.fn().mockResolvedValue(nativeStatusRequest(plan.planId)),
      execute: vi.fn().mockResolvedValue(terminalConflictRefusal),
      write,
      setExitCode: vi.fn(),
    });

    expect(JSON.parse(write.mock.calls[0]?.[0] as string)).toEqual({
      schemaVersion: 1, command: "delivery native land-status", ...terminalConflictRefusal,
    });
  });
});
