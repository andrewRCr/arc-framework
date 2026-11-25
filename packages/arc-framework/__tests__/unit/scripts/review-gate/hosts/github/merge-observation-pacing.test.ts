/** Bounded GitHub recomputation waits through the process and time boundaries. */

import { setImmediate } from "node:timers/promises";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createGhChangeRequestMergeObservationPort } from "../../../../../../src/scripts/review-gate/hosts/github/merge-observation.js";
import type { HostedProcessRunner } from "../../../../../../src/scripts/review-gate/hosted/gh-process.js";

const oid = (character: string): string => character.repeat(40);
const coordinates = { repository: "owner/repo", changeRequest: 42, baseRef: "main", base: oid("a"), head: oid("b") };
const output = (value: unknown) => ({ stdout: JSON.stringify(value), stderr: "" });

function recomputingHost(initial: "stale" | "pending", ready: () => boolean): HostedProcessRunner {
  return {
    run: async (args) => {
      const endpoint = args.at(-1) ?? "";
      if (endpoint.endsWith("/pulls/42")) return output({
        number: 42, base: { ref: "main" }, head: { sha: coordinates.head },
        mergeable: ready() || initial === "stale" ? true : null,
        merge_commit_sha: ready() ? oid("e") : initial === "stale" ? oid("c") : null,
      });
      if (endpoint.endsWith("/branches/main")) return output({ protection: null });
      if (endpoint.includes("/rules/branches/main")) return output([[]]);
      if (endpoint.endsWith(`/commits/${oid("c")}`)) {
        return output({ parents: [{ sha: oid("d") }, { sha: coordinates.head }] });
      }
      if (endpoint.endsWith(`/commits/${oid("e")}`)) {
        return output({ parents: [{ sha: coordinates.base }, { sha: coordinates.head }] });
      }
      throw new Error(`unexpected endpoint: ${endpoint}`);
    },
  };
}

const clockWait = (milliseconds: number) => new Promise<void>((resolve) => { setTimeout(resolve, milliseconds); });

afterEach(() => { vi.useRealTimers(); });

describe("GitHub merge-observation pacing", () => {
  it("reports a stale test merge after one read without pausing", async () => {
    vi.useFakeTimers();
    const start = Date.now();
    const port = createGhChangeRequestMergeObservationPort(
      recomputingHost("stale", () => Date.now() - start >= 2_000), { wait: clockWait },
    );
    await expect(port.observe(coordinates, { baseContained: false })).resolves.toMatchObject({
      ...coordinates, state: "unresolved", condition: "stale-base-test-merge",
      evidenceRef: `github:test-merge:${oid("c")}`,
    });
    expect(vi.getTimerCount()).toBe(0);
  });

  it("allows pending recomputation to finish between reads", async () => {
    vi.useFakeTimers();
    const start = Date.now();
    const port = createGhChangeRequestMergeObservationPort(
      recomputingHost("pending", () => Date.now() - start >= 2_000), { wait: clockWait },
    );
    let settled = false;
    const result = port.observe(coordinates, { baseContained: false }).then((value) => { settled = true; return value; });
    await vi.advanceTimersByTimeAsync(1_999);
    expect(settled).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    await expect(result).resolves.toMatchObject({
      ...coordinates, state: "mergeable", evidenceRef: `github:test-merge:${oid("e")}`,
    });
  });

  it("waits only between the three pending reads on expiry", async () => {
    vi.useFakeTimers();
    const port = createGhChangeRequestMergeObservationPort(recomputingHost("pending", () => false), { wait: clockWait });
    let settled = false;
    const result = port.observe(coordinates, { baseContained: false }).then((value) => { settled = true; return value; });
    await vi.advanceTimersByTimeAsync(3_999);
    expect(settled).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    await expect(result).resolves.toMatchObject({
      state: "unresolved", detail: expect.stringContaining("three-read observation limit"),
    });
    expect(vi.getTimerCount()).toBe(0);
  });

  it("cancels the production pause after a pending read", async () => {
    const controller = new AbortController();
    const port = createGhChangeRequestMergeObservationPort(recomputingHost("pending", () => false));
    const result = port.observe(coordinates, { baseContained: false, signal: controller.signal }).then(
      (value) => ({ state: "completed", value }),
      (error: unknown) => ({ state: "cancelled", error }),
    );
    await setImmediate();
    controller.abort();
    await expect(result).resolves.toMatchObject({ state: "cancelled", error: { name: "AbortError" } });
  });
});
