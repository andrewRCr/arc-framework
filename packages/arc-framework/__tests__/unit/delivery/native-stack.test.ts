import { describe, expect, it, vi } from "vitest";

import {
  degradeNativeDeliveryStack,
  linkDeliveryNativeStack,
  observeDeliveryNativeStack,
} from "../../../src/lib/delivery/native-stack.js";

const members = [
  { deliverableId: `sha256:${"a".repeat(64)}`, changeRequestId: "41", headRef: "delivery/wu/one", headSha: "a".repeat(40), baseRef: "main" },
  { deliverableId: `sha256:${"b".repeat(64)}`, changeRequestId: "42", headRef: "delivery/wu/two", headSha: "b".repeat(40), baseRef: "delivery/wu/one" },
] as const;

describe("native delivery stack", () => {
  it("keeps every observation arm closed and names partial members", async () => {
    const observe = vi.fn().mockResolvedValue({
      status: "partial", affectedDeliverableIds: [members[1].deliverableId],
    });
    await expect(observeDeliveryNativeStack({ repository: "o/r", members }, { observe }))
      .resolves.toEqual({ status: "partial", affectedDeliverableIds: [members[1].deliverableId] });
  });

  it("observes a singleton remainder but keeps singleton registration out of the host", async () => {
    const observe = vi.fn().mockResolvedValue({ status: "unregistered" });
    await expect(observeDeliveryNativeStack({ repository: "o/r", members: [members[0]] }, { observe }))
      .resolves.toEqual({ status: "unregistered" });
    expect(observe).toHaveBeenCalledOnce();

    observe.mockReset();
    const link = vi.fn();
    await expect(linkDeliveryNativeStack({
      repository: "o/r", members: [members[0]], optIn: true,
    }, { observe, link })).resolves.toMatchObject({ status: "refused", reason: "invalid-input" });
    expect(observe).not.toHaveBeenCalled();
    expect(link).not.toHaveBeenCalled();
  });

  it("refuses cross-repository and non-chain input before the host", async () => {
    const observe = vi.fn();
    await expect(observeDeliveryNativeStack({
      repository: "o/r", members: [{ ...members[0], headRepository: "fork/r" }, members[1]],
    }, { observe })).resolves.toEqual({ status: "refused", reason: "foreign-repository" });
    await expect(observeDeliveryNativeStack({
      repository: "o/r", members: [members[1], members[0]],
    }, { observe })).resolves.toEqual({ status: "refused", reason: "non-chain" });
    expect(observe).not.toHaveBeenCalled();
  });

  it("links only on opt-in and reobserves the exact chain without state writes", async () => {
    const observe = vi.fn()
      .mockResolvedValueOnce({ status: "unregistered" })
      .mockResolvedValueOnce({ status: "registered", stackNumber: 7 });
    const link = vi.fn().mockResolvedValue({ status: "submitted" });
    await expect(linkDeliveryNativeStack({ repository: "o/r", members, optIn: true }, { observe, link }))
      .resolves.toEqual({ status: "linked", stackNumber: 7, recommendedActionText: expect.any(String) });
    expect(link).toHaveBeenCalledOnce();

    observe.mockReset();
    link.mockReset();
    await expect(linkDeliveryNativeStack({ repository: "o/r", members, optIn: false }, { observe, link }))
      .resolves.toEqual({ status: "unlinked", recommendedActionText: expect.any(String) });
    expect(observe).not.toHaveBeenCalled();
    expect(link).not.toHaveBeenCalled();
  });

  it("returns an explicit downgrade when linking cannot be authoritatively confirmed", async () => {
    const observe = vi.fn()
      .mockResolvedValueOnce({ status: "unregistered" })
      .mockResolvedValueOnce({ status: "partial", affectedDeliverableIds: [members[0].deliverableId] });
    const link = vi.fn().mockResolvedValue({ status: "submitted" });
    await expect(linkDeliveryNativeStack({ repository: "o/r", members, optIn: true }, { observe, link }))
      .resolves.toMatchObject({ status: "downgrade-required", reason: "partial" });
  });

  it("converges successful unlink and already-unlinked observations through a fresh read", async () => {
    const observe = vi.fn()
      .mockResolvedValueOnce({ status: "registered", stackNumber: 7 })
      .mockResolvedValueOnce({ status: "unregistered" });
    const unlink = vi.fn().mockResolvedValue({ status: "submitted" });
    await expect(degradeNativeDeliveryStack({ repository: "o/r", members }, { observe, unlink }))
      .resolves.toMatchObject({ status: "unlinked" });

    observe.mockReset();
    unlink.mockReset();
    observe.mockResolvedValue({ status: "unregistered" });
    await expect(degradeNativeDeliveryStack({ repository: "o/r", members }, { observe, unlink }))
      .resolves.toMatchObject({ status: "unlinked" });
    expect(unlink).not.toHaveBeenCalled();

    observe.mockReset();
    unlink.mockReset();
    observe.mockResolvedValueOnce({ status: "registered", stackNumber: 7 })
      .mockResolvedValueOnce({ status: "unregistered" });
    unlink.mockResolvedValue({ status: "refused", reason: "unavailable" });
    await expect(degradeNativeDeliveryStack({ repository: "o/r", members }, { observe, unlink }))
      .resolves.toMatchObject({ status: "unlinked" });
  });

  it("blocks every non-unregistered final observation and preserves one explicit unlink remedy", async () => {
    const finalObservations = [
      { status: "registered", stackNumber: 7 },
      { status: "partial", affectedDeliverableIds: [members[0].deliverableId] },
      { status: "incoherent", affectedDeliverableIds: [members[0].deliverableId] },
      { status: "unsupported" },
      { status: "unavailable" },
      { status: "malformed" },
      { status: "ambiguous" },
    ] as const;
    for (const final of finalObservations) {
      const observe = vi.fn()
        .mockResolvedValueOnce({ status: "registered", stackNumber: 7 })
        .mockResolvedValueOnce(final);
      const unlink = vi.fn().mockResolvedValue({ status: "submitted" });
      await expect(degradeNativeDeliveryStack({ repository: "o/r", members }, { observe, unlink }))
        .resolves.toMatchObject({ status: "blocked", reason: final.status });
    }

    const observe = vi.fn()
      .mockResolvedValueOnce({ status: "registered", stackNumber: 7 })
      .mockResolvedValueOnce({ status: "registered", stackNumber: 7 });
    const unlink = vi.fn().mockResolvedValue({ status: "refused", reason: "unavailable" });
    await expect(degradeNativeDeliveryStack({ repository: "o/r", members }, { observe, unlink }))
      .resolves.toEqual({
        status: "blocked",
        reason: "unlink-unavailable",
        recommendedActionText: "Retry unlink when the host is available; do not land while native linkage remains authoritative.",
      });
    expect(observe).toHaveBeenCalledTimes(2);
  });
});
