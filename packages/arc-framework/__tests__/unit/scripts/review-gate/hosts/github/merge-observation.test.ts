import { describe, expect, it, vi } from "vitest";

import type { HostedProcessRunner } from "../../../../../../src/scripts/review-gate/hosted/gh-process.js";
import { createGhChangeRequestMergeObservationPort } from "../../../../../../src/scripts/review-gate/hosts/github/merge-observation.js";

const oid = (character: string): string => character.repeat(40);
const coordinates = {
  repository: "owner/repo",
  changeRequest: 42,
  baseRef: "main",
  base: oid("a"),
  head: oid("b"),
};

function pull(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    number: 42,
    base: { ref: "main", sha: coordinates.base },
    head: { sha: coordinates.head },
    mergeable: true,
    merge_commit_sha: oid("c"),
    ...overrides,
  };
}

function output(value: unknown) {
  return { stdout: JSON.stringify(value), stderr: "" };
}

describe("GitHub merge-observation port", () => {
  it("establishes mergeability only from exact test-merge parents", async () => {
    const run = vi.fn(async (args: string[]) => args.at(-1)?.includes("/commits/") === true
      ? output({ parents: [{ sha: coordinates.base }, { sha: coordinates.head }] })
      : output(pull()));
    const port = createGhChangeRequestMergeObservationPort({ run } satisfies HostedProcessRunner);
    await expect(port.observe(coordinates, { baseContained: true })).resolves.toEqual({
      ...coordinates,
      state: "mergeable",
      evidenceRef: `github:test-merge:${oid("c")}`,
    });
    expect(run).toHaveBeenCalledTimes(2);
  });

  it("accepts exact current-base parents when the pull base SHA lags its named ref", async () => {
    const run = vi.fn(async (args: string[]) => {
      const endpoint = args.at(-1) ?? "";
      if (endpoint.endsWith("/pulls/42")) {
        return output(pull({ base: { ref: coordinates.baseRef, sha: oid("d") } }));
      }
      if (endpoint.endsWith("/branches/main")) return output({ protection: null });
      if (endpoint.includes("/rules/branches/main")) return output([[]]);
      if (endpoint.includes("/commits/")) {
        return output({ parents: [{ sha: coordinates.base }, { sha: coordinates.head }] });
      }
      throw new Error(`unexpected command: ${args.join(" ")}`);
    });
    const port = createGhChangeRequestMergeObservationPort({ run } satisfies HostedProcessRunner);

    await expect(port.observe(coordinates, { baseContained: false })).resolves.toMatchObject({
      ...coordinates,
      state: "mergeable",
    });
  });

  it.each(["classic", "ruleset"] as const)("establishes strict currentness from explicit %s policy", async (kind) => {
    const run = vi.fn(async (args: string[]) => {
      const endpoint = args.at(-1) ?? "";
      if (endpoint.endsWith("/pulls/42")) return output(pull({ mergeable: false }));
      if (endpoint.endsWith("/branches/main")) return output({
        protection: {
          required_status_checks: { contexts: [], strict: kind === "classic" },
        },
      });
      if (endpoint.includes("/rules/branches/main")) return output([kind === "ruleset" ? [{
        type: "required_status_checks",
        parameters: { required_status_checks: [], strict_required_status_checks_policy: true },
      }] : []]);
      throw new Error(`unexpected command: ${args.join(" ")}`);
    });
    const port = createGhChangeRequestMergeObservationPort({ run } satisfies HostedProcessRunner);
    await expect(port.observe(coordinates, { baseContained: false })).resolves.toMatchObject({
      ...coordinates,
      state: "base-currentness-required",
    });
  });

  it("prioritizes strict currentness over an exact test merge for a behind head", async () => {
    const run = vi.fn(async (args: string[]) => {
      const endpoint = args.at(-1) ?? "";
      if (endpoint.endsWith("/pulls/42")) {
        return output(pull({ base: { ref: coordinates.baseRef, sha: oid("d") } }));
      }
      if (endpoint.endsWith("/branches/main")) return output({
        protection: { required_status_checks: { contexts: [], strict: true } },
      });
      if (endpoint.includes("/rules/branches/main")) return output([[]]);
      if (endpoint.includes("/commits/")) return output({
        parents: [{ sha: coordinates.base }, { sha: coordinates.head }],
      });
      throw new Error(`unexpected command: ${args.join(" ")}`);
    });
    const port = createGhChangeRequestMergeObservationPort({ run } satisfies HostedProcessRunner);
    await expect(port.observe(coordinates, { baseContained: false })).resolves.toMatchObject({
      ...coordinates,
      state: "base-currentness-required",
    });
  });

  it("does not infer strict currentness from a generic behind state", async () => {
    const run = vi.fn(async (args: string[]) => {
      const endpoint = args.at(-1) ?? "";
      if (endpoint.endsWith("/pulls/42")) {
        return output(pull({ mergeable: false, mergeable_state: "behind" }));
      }
      if (endpoint.endsWith("/branches/main")) return output({ protection: null });
      if (endpoint.includes("/rules/branches/main")) return output([[]]);
      throw new Error(`unexpected command: ${args.join(" ")}`);
    });
    const port = createGhChangeRequestMergeObservationPort({ run } satisfies HostedProcessRunner);
    await expect(port.observe(coordinates)).resolves.toMatchObject({
      state: "refused",
      condition: "not-mergeable",
    });
  });

  it("refuses a pull request GitHub cannot merge cleanly without reading it again", async () => {
    const run = vi.fn(async () => output(pull({ mergeable: false, merge_commit_sha: null })));
    const port = createGhChangeRequestMergeObservationPort({ run } satisfies HostedProcessRunner);

    await expect(port.observe(coordinates, { baseContained: true })).resolves.toEqual({
      ...coordinates,
      state: "refused",
      condition: "not-mergeable",
      detail: "GitHub reports the pull request cannot merge cleanly into its base.",
    });
    expect(run).toHaveBeenCalledOnce();
  });

  it.each([
    [
      "base-ref-mismatch",
      pull({ base: { ref: "release", sha: coordinates.base } }),
      "targets release, not main",
    ],
    ["head-moved", pull({ head: { sha: oid("e") } }), `head is ${oid("e")}, not ${oid("b")}`],
  ] as const)("refuses %s as a stable condition naming both values", async (condition, observed, detail) => {
    const run = vi.fn(async () => output(observed));
    const port = createGhChangeRequestMergeObservationPort({ run } satisfies HostedProcessRunner);

    await expect(port.observe(coordinates, { baseContained: true })).resolves.toMatchObject({
      ...coordinates,
      state: "refused",
      condition,
      detail: expect.stringContaining(detail),
    });
    expect(run).toHaveBeenCalledOnce();
  });

  it("keeps a different pull-request number and malformed test-merge parents pending", async () => {
    const renumbered = createGhChangeRequestMergeObservationPort({
      run: async () => output(pull({ number: 43 })),
    });
    await expect(renumbered.observe(coordinates, { baseContained: true })).resolves.toMatchObject({
      state: "unresolved", detail: expect.stringContaining("different pull request"),
    });

    const malformed = createGhChangeRequestMergeObservationPort({
      run: async (args) => args.at(-1)?.includes("/commits/") === true
        ? output({ parents: [{ sha: coordinates.base }] })
        : output(pull()),
    });
    await expect(malformed.observe(coordinates, { baseContained: true })).resolves.toMatchObject({
      state: "unresolved", detail: expect.stringContaining("parents did not match"),
    });
  });

  it("rejects reversed test-merge parents", async () => {
    const port = createGhChangeRequestMergeObservationPort({
      run: async (args) => args.at(-1)?.includes("/commits/") === true
        ? output({ parents: [{ sha: coordinates.head }, { sha: coordinates.base }] })
        : output(pull()),
    });

    await expect(port.observe(coordinates, { baseContained: true })).resolves.toMatchObject({
      state: "unresolved",
      detail: expect.stringContaining("parents did not match"),
    });
  });

  it("caps pending host computation at three pull reads", async () => {
    const run = vi.fn(async (args: string[]) => {
      const endpoint = args.at(-1) ?? "";
      if (endpoint.endsWith("/pulls/42")) return output(pull({ mergeable: null, merge_commit_sha: null }));
      if (endpoint.endsWith("/branches/main")) return output({ protection: null });
      if (endpoint.includes("/rules/branches/main")) return output([[]]);
      throw new Error(`unexpected command: ${args.join(" ")}`);
    });
    const port = createGhChangeRequestMergeObservationPort({ run } satisfies HostedProcessRunner);
    await expect(port.observe(coordinates)).resolves.toMatchObject({
      state: "unresolved", detail: expect.stringContaining("three-read observation limit"),
    });
    expect(run.mock.calls.filter(([args]) => args.at(-1)?.endsWith("/pulls/42") === true)).toHaveLength(3);
  });

  it("honors abort before any host read", async () => {
    const run = vi.fn(async () => output(pull()));
    const controller = new AbortController();
    controller.abort(new DOMException("stop", "AbortError"));
    const port = createGhChangeRequestMergeObservationPort({ run } satisfies HostedProcessRunner);
    await expect(port.observe(coordinates, { signal: controller.signal })).rejects.toMatchObject({
      name: "AbortError",
    });
    expect(run).not.toHaveBeenCalled();
  });
});
