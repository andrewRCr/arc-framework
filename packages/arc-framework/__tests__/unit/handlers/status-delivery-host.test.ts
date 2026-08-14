import { describe, expect, it, vi } from "vitest";

import { createSessionDeliveryObservationHost } from "../../../src/handlers/status.js";

describe("session delivery observation host", () => {
  it("propagates one aggregate abort signal across every host read", async () => {
    const head = "a".repeat(40);
    const tree = "b".repeat(40);
    const signals: AbortSignal[] = [];
    const runner = {
      run: vi.fn(async (args: string[], options?: { signal?: AbortSignal }) => {
        if (options?.signal !== undefined) signals.push(options.signal);
        return args.at(-1)?.includes("commits/") === true
          ? { stdout: JSON.stringify({ tree: { sha: tree } }), stderr: "" }
          : { stdout: JSON.stringify({ object: { sha: head } }), stderr: "" };
      }),
    };

    await expect(createSessionDeliveryObservationHost(runner).observeTarget(
      "owner/repository",
      "refs/heads/main",
    )).resolves.toEqual({ status: "observed", coordinates: { head, tree } });
    expect(signals).toHaveLength(2);
    expect(signals[0]).toBe(signals[1]);
  });

  it("degrades an expired aggregate read through the host refusal boundary", async () => {
    const runner = {
      run: vi.fn((_args: string[], options?: { signal?: AbortSignal }) => new Promise<never>((_resolve, reject) => {
        options?.signal?.addEventListener("abort", () => reject(options.signal?.reason), { once: true });
      })),
    };

    await expect(createSessionDeliveryObservationHost(runner, 1).observeTarget(
      "owner/repository",
      "refs/heads/main",
    )).resolves.toEqual({ status: "refused", reason: "unavailable" });
  });
});
