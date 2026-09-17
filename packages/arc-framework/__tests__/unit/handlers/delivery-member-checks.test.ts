/** CLI adapter coverage for delivery-member check observation. */

import { describe, expect, it, vi } from "vitest";

import {
  handleDeliveryMemberChecksObserve,
  type DeliveryMemberChecksHandlerDependencies,
} from "../../../src/handlers/delivery-member-checks.js";

const headSha = "a".repeat(40);
const member = {
  kind: "delivery-member" as const,
  planId: "123e4567-e89b-42d3-a456-426614174000",
  deliverableId: `sha256:${"b".repeat(64)}` as const,
  workUnitId: "stacked-example",
  head: headSha,
};
const input = {
  schemaVersion: 1 as const,
  repository: "owner/repo",
  pullRequest: 42,
  headSha,
  member,
};

function dependencies(): DeliveryMemberChecksHandlerDependencies {
  return {
    readText: vi.fn().mockResolvedValue(JSON.stringify(input)),
    observe: vi.fn().mockResolvedValue({
      schemaVersion: 1,
      mode: "delivery-member-checks-observe",
      repository: "owner/repo",
      pullRequest: 42,
      headSha,
      member,
      state: "qualified",
      nextAction: "complete",
      qualification: "green",
      checks: [{ name: "ci-ok", state: "green" }],
    }),
    write: vi.fn(),
    setExitCode: vi.fn(),
  };
}

describe("delivery-member checks handler", () => {
  it("emits the exact one-shot member qualification", async () => {
    const deps = dependencies();
    await handleDeliveryMemberChecksObserve({ input: "-", json: true }, deps);

    expect(deps.observe).toHaveBeenCalledWith(input);
    expect(JSON.parse(vi.mocked(deps.write).mock.calls[0]?.[0] as string)).toMatchObject({
      mode: "delivery-member-checks-observe",
      member,
      state: "qualified",
      qualification: "green",
    });
    expect(deps.setExitCode).not.toHaveBeenCalled();
  });

  it("rejects mismatched member and target heads before observation", async () => {
    const deps = dependencies();
    vi.mocked(deps.readText).mockResolvedValue(JSON.stringify({
      ...input,
      member: { ...member, head: "c".repeat(40) },
    }));

    await handleDeliveryMemberChecksObserve({ input: "-", json: true }, deps);

    expect(deps.observe).not.toHaveBeenCalled();
    expect(JSON.parse(vi.mocked(deps.write).mock.calls[0]?.[0] as string)).toMatchObject({
      mode: "delivery-member-checks-observe",
      state: "blocked",
      nextAction: "stop",
      reason: "invalid-input",
    });
    expect(deps.setExitCode).toHaveBeenCalledWith(64);
  });

  it("preserves a recoverable command failure with an actionable retry", async () => {
    const deps = dependencies();
    vi.mocked(deps.observe).mockRejectedValue(new Error("unexpected host failure"));

    await handleDeliveryMemberChecksObserve({ input: "request.json", json: true }, deps);

    expect(JSON.parse(vi.mocked(deps.write).mock.calls[0]?.[0] as string)).toMatchObject({
      repository: "owner/repo",
      pullRequest: 42,
      headSha,
      member,
      state: "blocked",
      nextAction: "stop",
      reason: "checks-unavailable",
      detail: "unexpected host failure",
      remedy: {
        invariant: "Required-check status must be readable for the exact delivery member.",
        argv: ["arc", "delivery", "checks", "observe", "request.json", "--json"],
      },
    });
    expect(deps.setExitCode).toHaveBeenCalledWith(1);
  });
});
