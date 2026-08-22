import { describe, expect, it, vi } from "vitest";

import { handleDeliveryExecution } from "../../../src/handlers/delivery-execution.js";
import { deliveryStackPlanFixture } from "../../fixtures/delivery-plan.js";
import { deliveryStateFixture } from "../../fixtures/delivery-state.js";

function publicationFields(plan: ReturnType<typeof deliveryStackPlanFixture>) {
  return {
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

describe("delivery execution handler", () => {
  it("preserves a prepared service result through the strict verb envelope", async () => {
    const plan = deliveryStackPlanFixture();
    const snapshot = {
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
    const execute = vi.fn();
    const firstWrite = vi.fn();
    await handleDeliveryExecution("position", { input: "-" }, undefined, {
      readText: vi.fn().mockResolvedValue("{}"), execute, write: firstWrite, setExitCode: vi.fn(),
    });
    expect(execute).not.toHaveBeenCalled();
    expect(JSON.parse(firstWrite.mock.calls[0]?.[0] as string).reason).toBe("invalid-command-input");

    const secondWrite = vi.fn();
    const state = deliveryStateFixture();
    await handleDeliveryExecution("position", { input: "-" }, undefined, {
      readText: vi.fn().mockResolvedValue(JSON.stringify({
        planId: state.planId,
        facts: { target: state.target, members: state.members, landedDeliverableIds: [] },
      })),
      execute: vi.fn().mockResolvedValue({ status: "invented" }),
      write: secondWrite,
      setExitCode: vi.fn(),
    });
    expect(JSON.parse(secondWrite.mock.calls[0]?.[0] as string).reason).toBe("invalid-service-result");
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
        facts: { target: state.target, members: state.members, landedDeliverableIds: [] },
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
        operationKind: "rewrite", mode: "provider-adoption", transition: "cleared",
        action: "delivery-native-observe",
      },
      { operationKind: "land", mode: "sequential", transition: "cleared", action: "delivery-land-prepare" },
      {
        operationKind: "land", mode: "native", transition: "cleared",
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

  it("accepts raw suffix locators without serialized proof or snapshots", async () => {
    const plan = deliveryStackPlanFixture();
    const execute = vi.fn().mockResolvedValue({ status: "refused", reason: "candidate-moved" });
    const write = vi.fn();
    await handleDeliveryExecution("rematerialize", { input: "-", json: true }, undefined, {
      readText: vi.fn().mockResolvedValue(JSON.stringify({
        planId: plan.planId,
        protectedBaseRef: "refs/heads/main",
        topRef: "refs/heads/control",
        candidates: plan.members.map((member, index) => ({
          deliverableId: member.deliverableId,
          ref: `refs/heads/candidate-${index + 1}`,
          checkoutPath: `/tmp/candidate-${index + 1}`,
        })),
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

  it("returns the typed after-fix verification route from rematerialization", async () => {
    const plan = deliveryStackPlanFixture();
    const state = deliveryStateFixture(plan);
    const changed = plan.members[0]!.deliverableId;
    const execute = vi.fn().mockResolvedValue({
      status: "rematerialized",
      state: { revision: 8, value: state },
      contributionVerdicts: [{ deliverableId: changed, contribution: "changed", proof: "selected-change" }],
      nextAction: "verify-review-fix",
      verification: { memberDeliverableIds: [changed], tier1Required: true },
    });
    const write = vi.fn();
    await handleDeliveryExecution("rematerialize", { input: "-", json: true }, undefined, {
      readText: vi.fn().mockResolvedValue(JSON.stringify({
        planId: plan.planId,
        protectedBaseRef: "refs/heads/main",
        topRef: "refs/heads/control",
        candidates: plan.members.map((member, index) => ({
          deliverableId: member.deliverableId,
          ref: `refs/heads/candidate-${index + 1}`,
          checkoutPath: `/tmp/candidate-${index + 1}`,
        })),
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
      verification: { memberDeliverableIds: [changed], tier1Required: true },
    });
  });

});
