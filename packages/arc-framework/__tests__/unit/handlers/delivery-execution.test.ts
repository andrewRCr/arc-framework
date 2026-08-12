import { describe, expect, it, vi } from "vitest";

import { handleDeliveryExecution } from "../../../src/handlers/delivery-execution.js";
import { deliveryStackPlanFixture } from "../../fixtures/delivery-plan.js";

describe("delivery execution handler", () => {
  it("preserves a prepared service result through the strict verb envelope", async () => {
    const plan = deliveryStackPlanFixture();
    const snapshot = {
      planId: plan.planId,
      workUnitId: plan.workUnitId,
      planRevision: plan.planRevision,
      planDigest: plan.planDigest,
      protectedBase: { ref: "refs/heads/main", head: "1".repeat(40), tree: "2".repeat(40) },
      control: { ref: "refs/heads/control", head: "3".repeat(40), tree: "4".repeat(40) },
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
        controlRef: "refs/heads/control",
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

  it("rejects malformed input before execution and invalid service output at the boundary", async () => {
    const execute = vi.fn();
    const firstWrite = vi.fn();
    await handleDeliveryExecution("position", { input: "-" }, undefined, {
      readText: vi.fn().mockResolvedValue("{}"), execute, write: firstWrite, setExitCode: vi.fn(),
    });
    expect(execute).not.toHaveBeenCalled();
    expect(JSON.parse(firstWrite.mock.calls[0]?.[0] as string).reason).toBe("invalid-command-input");

    const secondWrite = vi.fn();
    await handleDeliveryExecution("position", { input: "-" }, undefined, {
      readText: vi.fn().mockResolvedValue(JSON.stringify({
        planId: "123e4567-e89b-42d3-a456-426614174000", facts: {},
      })),
      execute: vi.fn().mockResolvedValue({ status: "invented" }),
      write: secondWrite,
      setExitCode: vi.fn(),
    });
    expect(JSON.parse(secondWrite.mock.calls[0]?.[0] as string).reason).toBe("invalid-service-result");
  });

  it("rejects a closed eligibility snapshot as materialization authority", async () => {
    const plan = deliveryStackPlanFixture();
    const execute = vi.fn().mockResolvedValue({ status: "materialized" });
    const write = vi.fn();

    await handleDeliveryExecution("materialize", { input: "-", json: true }, undefined, {
      readText: vi.fn().mockResolvedValue(JSON.stringify({
        plan,
        snapshot: {
          planId: plan.planId,
          workUnitId: plan.workUnitId,
          planRevision: plan.planRevision,
          planDigest: plan.planDigest,
          protectedBase: { ref: "refs/heads/main", head: "1".repeat(40), tree: "2".repeat(40) },
          control: { ref: "refs/heads/control", head: "3".repeat(40), tree: "4".repeat(40) },
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
      command: "delivery materialize",
      status: "refused",
      reason: "invalid-command-input",
    });
  });

  it("accepts only raw candidate refs and checkout locators for mutation", async () => {
    const plan = deliveryStackPlanFixture();
    const write = vi.fn();

    await handleDeliveryExecution("materialize", { input: "-", json: true }, undefined, {
      readText: vi.fn().mockResolvedValue(JSON.stringify({
        planId: plan.planId,
        protectedBaseRef: "refs/heads/main",
        controlRef: "refs/heads/control",
        candidates: plan.members.map((member, index) => ({
          deliverableId: member.deliverableId,
          ref: `refs/heads/candidate-${index + 1}`,
          checkoutPath: `/tmp/candidate-${index + 1}`,
        })),
        remote: "origin",
      })),
      execute: vi.fn().mockResolvedValue({ status: "refused", reason: "checkout-moved" }),
      write,
      setExitCode: vi.fn(),
    });

    expect(JSON.parse(write.mock.calls[0]?.[0] as string)).toMatchObject({
      command: "delivery materialize",
      status: "refused",
      reason: "checkout-moved",
    });
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

  it("accepts raw suffix locators without serialized proof or snapshots", async () => {
    const plan = deliveryStackPlanFixture();
    const execute = vi.fn().mockResolvedValue({ status: "refused", reason: "candidate-moved" });
    const write = vi.fn();
    await handleDeliveryExecution("rematerialize", { input: "-", json: true }, undefined, {
      readText: vi.fn().mockResolvedValue(JSON.stringify({
        planId: plan.planId,
        protectedBaseRef: "refs/heads/main",
        controlRef: "refs/heads/control",
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

  it("accepts only terminal repository locators at the command boundary", async () => {
    const prepare = vi.fn().mockResolvedValue({ status: "terminal-ready" });
    const write = vi.fn();
    await handleDeliveryExecution("terminal-prepare", { input: "-", json: true }, undefined, {
      readText: vi.fn().mockResolvedValue(JSON.stringify({
        repository: "andrewRCr/arc-framework",
        remote: "origin",
        controlRef: "refs/heads/feat/example",
        controlCheckoutPath: "/tmp/control",
        protectedTargetRef: "refs/heads/main",
      })), execute: prepare, write, setExitCode: vi.fn(),
    });
    expect(prepare).toHaveBeenCalledOnce();
    expect(JSON.parse(write.mock.calls[0]?.[0] as string).status).toBe("terminal-ready");

    const attach = vi.fn().mockResolvedValue({ status: "not-applicable" });
    await handleDeliveryExecution("terminal-attach", { input: "-", json: true }, undefined, {
      readText: vi.fn().mockResolvedValue(JSON.stringify({
        repository: "andrewRCr/arc-framework",
        remote: "origin",
        retainedControlRef: "refs/heads/feat/example",
        changeRequestId: "401",
      })), execute: attach, write: vi.fn(), setExitCode: vi.fn(),
    });
    expect(attach).toHaveBeenCalledOnce();
  });
});
